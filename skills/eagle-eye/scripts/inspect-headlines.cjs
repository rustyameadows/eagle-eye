// Capture intact text runs and one stylesheet counterfactual at a time in local Chromium.
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { execFileSync } = require('node:child_process');
const { launchChromium, openView } = require('./browser.cjs');
const { discoverHeadlines, observeHeading } = require('./headline-dom.cjs');

const usage = `Usage: node inspect-headlines.cjs URL_OR_HTML_OR_PLAN_JSON NEW_OUTPUT_DIR
  [--scope hero|all | --selector CSS] [--variants VARIANTS.json]
  [--width 1440 --height 900 --scale 1 --ready SELECTOR] (single page)
Variants: [{"id":"native","selector":"#title","css":"#title{font-kerning:normal}","word":"Today","pair":"To"}]
Optional view and profiles restrict each variant. Each targeted heading is inspected within scope.
Capture uses unmodified baseline text. Range boxes are layout anchors; inspect the original raster.
The output includes report.json, clean screenshots, annotated details and contact sheets.`;
const idOK = (value) =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9-]*$/i.test(value) &&
  !['constructor', 'prototype'].includes(value);
const fileOrUrl = (input) =>
  /^(file|https?):/i.test(input) ? new URL(input) : pathToFileURL(path.resolve(input));
const screenshotOptions = { type: 'png', fullPage: true, animations: 'disabled', caret: 'hide' };
const settle = (page) =>
  page.evaluate(async () => {
    document.documentElement.getBoundingClientRect();
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

async function readInput(input, values) {
  const url = fileOrUrl(input);
  if (url.protocol === 'file:' && url.pathname.endsWith('.json')) {
    if (['width', 'height', 'scale', 'ready'].some((key) => values[key] !== undefined))
      throw Error('Set profile dimensions and ready selectors in the supplied plan.');
    const data = JSON.parse(await fs.readFile(fileURLToPath(url), 'utf8'));
    if (!data.profiles || !data.views) throw Error('Plan requires named profiles and views.');
    return {
      url,
      ...Object.fromEntries(['title', 'profiles', 'views'].map((key) => [key, data[key]]))
    };
  }
  return {
    url,
    title: 'Headline audit',
    profiles: {
      default: {
        width: Number(values.width ?? 1440),
        height: Number(values.height ?? 900),
        scale: Number(values.scale ?? 1)
      }
    },
    views: { page: { url: url.href, ready: values.ready } }
  };
}

function validate(input, variants) {
  for (const group of ['profiles', 'views']) {
    if (!Object.keys(input[group]).length || !Object.keys(input[group]).every(idOK))
      throw Error('Use nonempty ' + group + ' and filename-safe IDs.');
  }
  for (const p of Object.values(input.profiles)) {
    if (
      ![p.width, p.height].every((v) => Number.isSafeInteger(v) && v > 0) ||
      !(Number.isFinite(p.scale) && p.scale > 0) ||
      !['dark', 'light'].includes(p.theme ?? 'light')
    )
      throw Error('Invalid viewport, scale or color scheme.');
  }
  for (const v of Object.values(input.views)) {
    if (!v.url || !['http:', 'https:', 'file:'].includes(new URL(v.url, input.url).protocol))
      throw Error('Supply an HTML file or HTTP(S) destination for each view.');
  }
  if (!Array.isArray(variants)) throw Error('Variants must be an array.');
  const ids = new Set();
  for (const v of variants) {
    if (!idOK(v.id) || ids.has(v.id) || !v.selector?.trim() || !v.css?.trim())
      throw Error('Each variant needs a unique filename-safe id, heading selector and stylesheet.');
    ids.add(v.id);
    if (v.view !== undefined && !Object.hasOwn(input.views, v.view))
      throw Error('Unknown variant view ' + v.view);
    if (
      v.profiles !== undefined &&
      (!Array.isArray(v.profiles) ||
        !v.profiles.length ||
        !v.profiles.every((key) => Object.hasOwn(input.profiles, key)))
    )
      throw Error('Unknown or empty variant profiles.');
    for (const key of ['pair', 'word'])
      if (v[key] !== undefined && (typeof v[key] !== 'string' || !v[key].length))
        throw Error('Use a nonempty literal for ' + key + '.');
  }
}

async function arrive(page, view, base) {
  const target = new URL(view.url, base).href;
  if (!view.arriveVia) await openView(page, target, view.ready);
  else {
    const via = view.arriveVia;
    await openView(page, new URL(via.url, base).href, via.ready);
    const link = page.locator(via.link);
    const valid = await link.evaluate(
      (el, target) =>
        el.tagName === 'A' &&
        el.href === target &&
        !el.hasAttribute('download') &&
        (!el.target || el.target === '_self'),
      target
    );
    if (!valid) throw Error('Arrival link does not reach the declared same-tab view.');
    await link.click();
    await page.waitForURL((url) => url.href === target);
    if (view.ready) await page.locator(view.ready).waitFor({ state: 'visible' });
  }
  await settle(page);
}

async function diagnostics(session, root, selector) {
  const result = {
    fonts: [],
    fontRuns: [],
    accessibility: { role: null, name: null },
    diagnosticWarnings: []
  };
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root, selector });
  if (!nodeId) throw Error('Heading disappeared: ' + selector);
  try {
    const { nodes } = await session.send('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: false
    });
    const ax = nodes.find((n) => !n.ignored);
    if (ax) result.accessibility = { role: ax.role?.value ?? null, name: ax.name?.value ?? null };
    else result.diagnosticWarnings.push('No exposed accessibility node for this element.');
  } catch {
    result.diagnosticWarnings.push('Accessibility name unavailable.');
  }
  try {
    const { node } = await session.send('DOM.describeNode', { nodeId, depth: -1 });
    const textNodes = [];
    function visit(n) {
      if (n.nodeType === 3 && n.nodeValue.length) textNodes.push(n);
      else n.children?.forEach(visit);
    }
    visit(node);
    // Query text nodes individually. An element query can include nested spans;
    // aggregating both ancestor and descendant counts would double-count glyphs.
    if (textNodes.length) {
      const { nodeIds } = await session.send('DOM.pushNodesByBackendIdsToFrontend', {
        backendNodeIds: textNodes.map((n) => n.backendNodeId)
      });
      const counts = new Map();
      for (const [i, id] of nodeIds.entries()) {
        const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId: id });
        if (fonts.length) result.fontRuns.push({ text: textNodes[i].nodeValue, fonts });
        for (const font of fonts) {
          const key = font.postScriptName + '|' + font.familyName;
          const old = counts.get(key);
          if (old) old.glyphCount += font.glyphCount;
          else counts.set(key, { ...font });
        }
      }
      result.fonts = [...counts.values()];
    }
    if (!result.fonts.length) result.diagnosticWarnings.push('Rendered font usage unavailable.');
  } catch {
    result.diagnosticWarnings.push('Rendered font usage unavailable.');
  }
  return result;
}

async function captureView(context, plan, pid, vid, options, out, seen) {
  const page = await context.newPage();
  const prefix = pid + '/' + vid;
  await fs.mkdir(path.join(out, prefix), { recursive: true });
  const result = { file: prefix + '/page.png', headings: [], warnings: [] };
  try {
    const view = plan.views[vid];
    await arrive(page, view, plan.url);
    result.url = page.url();
    result.arrival = view.arriveVia ? 'link' : 'direct';
    const session = await context.newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const selectors = await page.evaluate(discoverHeadlines, {
      scope: options.scope,
      selector: options.selector
    });
    const inspect = async (selector) => {
      const data = await page.locator(selector).evaluate(observeHeading);
      return { ...data, ...(await diagnostics(session, root.nodeId, selector)) };
    };
    // Capturing can trigger deferred font layout. Admit a frame only if the document
    // reports the same shaped line boxes immediately before and after that PNG.
    const captureStable = async (selected, file) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await settle(page);
        const before = [];
        for (const selector of selected) before.push(await inspect(selector));
        await page.screenshot({ ...screenshotOptions, path: path.join(out, file) });
        const shifted = [];
        for (let i = 0; i < selected.length; i++) {
          const after = await page.locator(selected[i]).evaluate(observeHeading);
          const layout = (h) => JSON.stringify([h.text, h.box, h.lines, h.runs]);
          if (layout(before[i]) !== layout(after)) shifted.push(selected[i]);
        }
        if (!shifted.length) return before;
        if (attempt === 2)
          throw Error(
            'Text or layout changed during capture for ' +
              shifted.join(', ') +
              '. Supply a stable ready state.'
          );
      }
    };
    const baseline = await captureStable(selectors, result.file);
    for (let i = 0; i < selectors.length; i++) {
      const stem = prefix + '/heading-' + String(i + 1).padStart(2, '0');
      result.headings.push({
        selector: selectors[i],
        ...baseline[i],
        file: stem + '.png',
        variants: []
      });
    }
    if (!selectors.length) result.warnings.push('No rendered heading matched the requested scope.');
    for (const v of options.variants.filter(
      (v) => (!v.view || v.view === vid) && (!v.profiles || v.profiles.includes(pid))
    )) {
      const matches = await page.locator(v.selector).count();
      if (!matches) {
        if (v.view) result.warnings.push('Missing variant target ' + v.id);
        continue;
      }
      if (matches !== 1) throw Error('Variant ' + v.id + ' must select one heading in ' + vid + '.');
      const selector = await page
        .locator(v.selector)
        .evaluate(
          (el, selectors) => selectors.find((s) => document.querySelector(s) === el),
          selectors
        );
      const heading = result.headings.find((h) => h.selector === selector);
      if (!heading) {
        result.warnings.push('Variant outside requested heading scope: ' + v.id);
        continue;
      }
      const style = await page.addStyleTag({ content: v.css });
      try {
        if (!(await style.evaluate((el) => el.sheet?.cssRules.length > 0)))
          throw Error('Empty or invalid variant stylesheet: ' + v.id);
        await settle(page);
        const stem = heading.file.slice(0, -4) + '-' + v.id;
        const pageFile = stem + '-page.png';
        const [captured] = await captureStable([selector], pageFile);
        const item = {
          id: v.id,
          css: v.css,
          ...captured,
          word: v.word,
          pair: v.pair,
          pageFile,
          file: stem + '.png'
        };
        heading.variants.push(item);
        seen.add(v.id);
      } finally {
        await style.evaluate((el) => el.remove());
        await settle(page);
      }
    }
    return result;
  } finally {
    await page.close();
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      scope: { type: 'string' },
      selector: { type: 'string' },
      variants: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      scale: { type: 'string' },
      ready: { type: 'string' },
      help: { type: 'boolean' }
    }
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (positionals.length !== 2) throw Error(usage);
  if ((values.scope && values.selector) || !['hero', 'all'].includes(values.scope ?? 'hero'))
    throw Error('Choose --scope hero|all or --selector CSS.');
  const plan = await readInput(positionals[0], values),
    out = path.resolve(positionals[1]);
  const variants = values.variants ? JSON.parse(await fs.readFile(values.variants, 'utf8')) : [];
  validate(plan, variants);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.mkdir(out);
  const browser = await launchChromium();
  const report = {
    title: plan.title || 'Headline audit',
    browser: 'Chromium ' + browser.version(),
    scope: values.selector ? 'selector' : (values.scope ?? 'hero'),
    selector: values.selector,
    profiles: plan.profiles,
    captures: {},
    warnings: []
  };
  const seen = new Set();
  try {
    for (const [pid, p] of Object.entries(plan.profiles)) {
      const context = await browser.newContext({
        viewport: { width: p.width, height: p.height },
        deviceScaleFactor: p.scale,
        reducedMotion: 'reduce',
        colorScheme: p.theme ?? 'light'
      });
      report.captures[pid] = {};
      try {
        for (const vid of Object.keys(plan.views))
          report.captures[pid][vid] = await captureView(
            context,
            plan,
            pid,
            vid,
            { scope: values.scope ?? 'hero', selector: values.selector, variants },
            out,
            seen
          );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  for (const v of variants)
    if (!seen.has(v.id)) report.warnings.push('Variant was never observed: ' + v.id);
  const reportPath = path.join(out, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  execFileSync('python3', [path.join(__dirname, 'headline-evidence.py'), reportPath], {
    stdio: 'inherit'
  });
  console.log(reportPath);
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
