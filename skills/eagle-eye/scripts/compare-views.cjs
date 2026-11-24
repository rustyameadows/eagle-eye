const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseArgs } = require('node:util');
const { validate, compare } = require('./view-contract.cjs');
const { launchChromium, openView } = require('./browser.cjs');

function readBoxes(selectors) {
  const anchors = {};
  for (const [name, selector] of Object.entries(selectors)) {
    let matches;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      anchors[name] = { issue: 'invalid CSS selector' };
      continue;
    }
    if (matches.length !== 1) {
      anchors[name] = { issue: matches.length ? 'ambiguous (' + matches.length + ' matches)' : 'missing' };
      continue;
    }
    const el = matches[0];
    const { left, right, top, bottom } = el.getBoundingClientRect();
    const visible = el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    if (!visible || right <= left || bottom <= top) anchors[name] = { issue: 'hidden or empty' };
    else if (right <= 0 || bottom <= 0 || left >= innerWidth || top >= innerHeight)
      anchors[name] = { issue: 'outside viewport' };
    else {
      const computed = getComputedStyle(el);
      const styles = {};
      for (const property of [
        'padding-left',
        'padding-right',
        'padding-top',
        'padding-bottom',
        'margin-left',
        'margin-right',
        'margin-top',
        'margin-bottom',
        'border-left-width',
        'border-right-width',
        'border-top-width',
        'border-bottom-width',
        'column-gap',
        'row-gap',
        'transform',
        'box-sizing'
      ]) {
        styles[property] = computed.getPropertyValue(property);
      }
      anchors[name] = { box: { left, right, top, bottom }, styles };
    }
  }
  return {
    anchors,
    scroll: [scrollX, scrollY],
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio
  };
}

async function capture(context, plan, viewId, profileId, planUrl, out) {
  const view = plan.views[viewId];
  const profile = plan.profiles[profileId];
  const page = await context.newPage();
  let data, png;
  try {
    const target = new URL(view.url, planUrl).href;
    if (view.arriveVia) {
      const start = new URL(view.arriveVia.url, planUrl).href;
      await openView(page, start, view.arriveVia.ready);
      if (page.url() !== start) throw new Error('Unexpected starting URL after navigation');
      const link = page.locator(view.arriveVia.link);
      await link.waitFor({ state: 'visible' });
      const info = await link.evaluate((el) => ({
        href: el.href,
        target: el.target,
        tag: el.tagName,
        download: el.hasAttribute('download')
      }));
      if (
        info.tag !== 'A' ||
        info.href !== target ||
        info.download ||
        (info.target && info.target !== '_self')
      )
        throw new Error('Navigation link does not identify the declared same-tab destination');
      await link.click();
      await page.waitForURL((url) => url.href === target);
      if (view.ready) await page.locator(view.ready).waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
    } else await openView(page, target, view.ready);
    if (page.url() !== target)
      throw new Error('Unexpected final URL; check redirect or authentication state');
    const selectors = { ...plan.anchors, ...view.selectors };
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const before = await page.evaluate(readBoxes, selectors);
      png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
      data = await page.evaluate(readBoxes, selectors);
      if (JSON.stringify(before) === JSON.stringify(data)) break;
      if (attempt === 2) return { issue: 'Anchor geometry changed during three captures' };
    }
    if (
      data.scroll.some((v) => v !== 0) ||
      data.dpr !== profile.scale ||
      data.viewport[0] !== profile.width ||
      data.viewport[1] !== profile.height
    )
      return { issue: 'Capture viewport, device scale or scroll origin differs from profile' };
  } catch (error) {
    return { issue: error.message.split('\n')[0] };
  } finally {
    await page.close();
  }
  const file = profileId + '/' + viewId + '.png';
  await fs.writeFile(path.join(out, file), png, { flag: 'wx' });
  return { ...data, file };
}

function summary(report, finished) {
  const fmt = (n) => (n == null ? '—' : String(n));
  const cells = (values) =>
    '| ' + values.map((v) => String(v).replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ') + ' |';
  const lines = [
    '# ' + report.plan.title,
    '',
    finished ? 'Capture complete.' : 'Capture in progress.',
    '',
    'Browser: ' + report.browser,
    '',
    '## Coverage',
    '',
    '| Profile | View | Arrival | Capture |',
    '| --- | --- | --- | --- |'
  ];
  for (const [profile, views] of Object.entries(report.captures)) {
    for (const [view, c] of Object.entries(views))
      lines.push(cells([profile, view, c.arrival, c.issue || '[Clean PNG](' + c.file + ')']));
  }
  lines.push(
    '',
    '## View comparisons',
    '',
    'Distances and signed changes are in CSS pixels. Positive means right or down for screen positions. Relative gaps follow the order of the two edges in the rule.',
    '',
    '| Profile | From → to | Check | From | To | Change | Intended | Tolerance | Status | Notes |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |'
  );
  for (const r of report.rows)
    lines.push(
      cells([
        r.profile,
        r.from + ' → ' + r.to,
        report.plan.checks[r.check].label,
        fmt(r.a.value),
        fmt(r.b.value),
        fmt(r.delta),
        r.expected,
        r.tolerance,
        r.status,
        [
          report.captures[r.profile][r.from].arrival + ' / ' + report.captures[r.profile][r.to].arrival,
          r.reason,
          r.a.issue,
          r.b.issue
        ]
          .filter(Boolean)
          .join(' / ')
      ])
    );
  if (finished)
    lines.push(
      '',
      '[Open the visual comparison](index.html) · [Measurements and capture settings](report.json)'
    );
  return lines.join('\n') + '\n';
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'fail-on-drift': { type: 'boolean' } }
  });
  if (positionals.length !== 2)
    throw new Error('Usage: node compare-views.cjs PLAN.json NEW-OUTPUT-DIR [--fail-on-drift]');
  const [planPath, out] = positionals;
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  validate(plan);
  const template = await fs.readFile(path.join(__dirname, '../assets/view-report.html'), 'utf8');
  await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await fs.mkdir(out); // Refuse an existing run, including concurrent writers.
  const browser = await launchChromium();
  const report = {
    version: 1,
    browser: 'Chromium ' + browser.version(),
    reducedMotion: 'reduce',
    plan,
    captures: {},
    rows: []
  };
  const update = async (finished) => {
    await fs.writeFile(path.join(out, 'AUDIT.md.tmp'), summary(report, finished));
    await fs.rename(path.join(out, 'AUDIT.md.tmp'), path.join(out, 'AUDIT.md'));
  };
  try {
    await update(false);
    for (const [id, p] of Object.entries(plan.profiles)) {
      const context = await browser.newContext({
        viewport: { width: p.width, height: p.height },
        deviceScaleFactor: p.scale,
        colorScheme: p.theme ?? 'light',
        reducedMotion: 'reduce'
      });
      try {
        const views = (report.captures[id] = {});
        await fs.mkdir(path.join(out, id));
        const pairs = plan.pairs.filter((pair) => !pair.profiles || pair.profiles.includes(id));
        const needed = new Set(pairs.flatMap((pair) => [pair.from, pair.to]));
        for (const view of needed) {
          const evidence = await capture(
            context,
            plan,
            view,
            id,
            pathToFileURL(path.resolve(planPath)),
            out
          );
          const via = plan.views[view].arriveVia;
          const startId =
            via &&
            Object.keys(plan.views).find(
              (key) => plan.views[key].url === via.url && !plan.views[key].arriveVia
            );
          evidence.arrival = via ? 'Link from ' + (startId || via.url) : 'Direct entry';
          views[view] = evidence;
          await update(false);
        }
        report.rows.push(...compare(plan, id, views));
        await update(false);
      } finally {
        await context.close();
      }
    }
    const json = JSON.stringify(report);
    const html = template.replace(/\/\*REPORT_DATA\*\/\s*null/, () => json.replaceAll('<', '\\u003c'));
    await fs.writeFile(path.join(out, 'index.html'), html);
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await update(true);
  } finally {
    await browser.close();
  }
  const counts = {};
  for (const row of report.rows) counts[row.status] = (counts[row.status] || 0) + 1;
  console.log(JSON.stringify({ out, checks: report.rows.length, ...counts }));
  if (values['fail-on-drift'] && (counts.drift || counts.unverified)) process.exitCode = 2;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
