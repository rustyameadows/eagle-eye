const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { discoveryPacket, choicesPacket, writeJSON } = require('./packets.cjs');
const { evaluateObservation, compareRasters } = require('./score.cjs');

const base = __dirname;
const repo = path.resolve(base, '../..');
const plan = require('./plan.json');
const oracle = require('./oracle.json');
const inspector = path.join(repo, 'skills/eagle-eye/scripts/inspect-headlines.cjs');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const find = (report, profile, spec) => report.captures[profile]?.[spec.view]?.headings.find(h => h.selector === spec.selector);
const relative = (dir, file) => path.posix.join(dir, file);
function run(program, args) {
  const result = spawnSync(program, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw Error(result.error?.message || path.basename(args[0]) + ' exited with ' + (result.status ?? result.signal));
}
async function inspect(source, dest, options = []) {
  run(process.execPath, [inspector, source, dest, ...options]);
  return portableReport(dest);
}

// All eval pages live beside the evidence. Use document-relative URLs so a
// published or copied run can open its source after the scratch directory goes away.
async function portableReport(dest) {
  const file = path.join(dest, 'report.json');
  const report = await readJSON(file);
  for (const captures of Object.values(report.captures)) {
    for (const capture of Object.values(captures)) {
      if (!capture.url?.startsWith('file:')) continue;
      capture.url = path.relative(dest, fileURLToPath(capture.url)).split(path.sep).map(encodeURIComponent).join('/');
    }
  }
  await writeJSON(file, report);
  return report;
}

async function sourceRevisions(output) {
  for (const stage of ['baseline', 'fixed']) {
    const root = path.join(output, 'specimens', stage);
    await fs.mkdir(root, { recursive: true });
    await fs.cp(path.join(base, 'fixture'), path.join(root, 'fixture'), { recursive: true });
    await writeJSON(path.join(root, 'plan.json'), plan);
    if (stage === 'baseline') continue;
    for (const [view, target] of Object.entries(plan.views)) {
      const file = path.join(root, target.url);
      const html = await fs.readFile(file, 'utf8');
      const repairs = oracle.seeds.filter(s => s.view === view).map(s => s.repairCSS);
      if (!repairs.length) continue;
      if (!html.includes('</head>')) throw Error('Cannot apply source repair in ' + view);
      await fs.writeFile(file, html.replace('</head>', '<style>\n' + repairs.join('\n') + '\n</style>\n</head>'));
    }
  }
}

// Independent boundary retests observe native, whole-word ranges in both
// static revisions at the actual CSS media-query edge. No overrides are added.
async function boundaryRetests(output) {
  const { launchChromium, openView } = require('../../skills/eagle-eye/scripts/browser.cjs');
  const browser = await launchChromium();
  const results = [];
  try {
    for (const spec of oracle.seeds.filter(s => Number.isFinite(s.breakpoint))) {
      for (const width of [spec.breakpoint - 1, spec.breakpoint, spec.breakpoint + 1]) {
        const values = {};
        const dir = path.join(output, 'boundary');
        await fs.mkdir(dir, { recursive: true });
        for (const stage of ['baseline', 'fixed']) {
          const page = await browser.newPage({ viewport: { width, height: 720 }, deviceScaleFactor: 1 });
          try {
            const file = path.join(output, 'specimens', stage, plan.views[spec.view].url);
            await openView(page, pathToFileURL(file).href, spec.selector);
            const target = page.locator(spec.selector);
            values[stage] = await target.evaluate(node => {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
              const extents = [];
              // Each word range retains the original surrounding shaping context.
              while (walker.nextNode()) {
                const text = walker.currentNode;
                for (const word of text.data.matchAll(/\S+/gu)) {
                  const range = new Range();
                  range.setStart(text, word.index);
                  range.setEnd(text, word.index + word[0].length);
                  extents.push({ text: word[0], width: range.getBoundingClientRect().width });
                }
              }
              return extents;
            });
            await target.screenshot({ path: path.join(dir, spec.id + '-' + width + '-' + stage + '.png') });
          } finally { await page.close(); }
        }
        const active = width <= spec.breakpoint;
        const delta = values.fixed.reduce((sum, item, i) => sum + item.width - values.baseline[i].width, 0);
        const baseline = 'boundary/' + spec.id + '-' + width + '-baseline.png';
        const repair = 'boundary/' + spec.id + '-' + width + '-fixed.png';
        const [same] = compareRasters(output, [[baseline, repair]]);
        const expectDirection = (spec.direction === 'loose' ? -1 : 1) * delta > 0.125;
        const passed = active ? !same && expectDirection : same && Math.abs(delta) < 0.01;
        results.push({ id: spec.id, width, active, delta, baseline, repair, status: passed ? 'passed' : 'failed' });
      }
    }
  } finally { await browser.close(); }
  return results;
}

function checkModes(all, hero, selected) {
  const target = oracle.modeChecks;
  const main = all.captures.wide[target.view];
  const heroRows = hero.captures.default.page.headings;
  const selectedRows = selected.captures.default.page.headings;
  const below = main.headings.find(h => h.selector === target.belowFold);
  const criteria = [
    ['hero includes the nonsemantic display title', heroRows.some(h => h.selector === target.nonsemantic)],
    ['all includes the below-fold semantic heading', below && below.box.y >= plan.profiles.wide.height],
    ['selected returns only the requested below-fold heading', selectedRows.length === 1 && selectedRows[0].selector === target.selected],
    ['hero and all have different breadth', main.headings.length > heroRows.length]
  ];
  const wrap = target.wrap;
  const wide = find(all, 'wide', wrap), compact = find(all, 'compact', wrap);
  criteria.push(['the wrap control changes lines across viewport profiles', wide && compact && JSON.stringify(wide.lines.map(l => l.text)) !== JSON.stringify(compact.lines.map(l => l.text))]);
  return criteria.map(([criterion, passed]) => ({ criterion, status: passed ? 'passed' : 'failed' }));
}

async function score(output, beforeReport, fixedReport, packet) {
  const sourcePairs = packet.key.items.map(item => [
    relative('discovery', item.id + '.png'), relative('inspection', beforeReport.captures[item.profile][item.view].file)]);
  const sameCaptures = compareRasters(output, sourcePairs);
  const unchanged = new Map(packet.key.items.map((item, i) => [item.profile + '/' + item.view, sameCaptures[i]]));
  const pairs = [];
  const specs = [...oracle.seeds.map(spec => ({ spec, kind: 'seed' })), ...oracle.controls.map(spec => ({ spec, kind: 'control' }))];
  const items = specs.map(({ spec, kind }) => {
    const observations = [];
    for (const profile of Object.keys(plan.profiles)) {
      const active = kind === 'seed' && spec.profiles.includes(profile);
      const before = find(beforeReport, profile, spec);
      const fixed = find(fixedReport, profile, spec);
      if (!before || !fixed) {
        observations.push({ profile, active, status: 'failed', failures: ['Target is absent from the inventory.'] });
        continue;
      }
      const candidate = before.variants.find(v => v.id === spec.id);
      const baseline = relative('inspection', before.file), repair = relative('retest', fixed.file);
      const pairIndex = pairs.push([baseline, repair]) - 1;
      const trialIndex = candidate ? pairs.push([relative('inspection', candidate.file), repair]) - 1 : null;
      const details = before.details?.find(d => d.pair === spec.pair) || before.details?.[0];
      observations.push({ profile, active, baseline, repair, detail: details?.file && relative('inspection', details.file),
        trial: candidate && relative('inspection', candidate.file), before, fixed, pairIndex, trialIndex });
    }
    return { id: spec.id, title: spec.text, kind, category: spec.kind || 'control', view: spec.view,
      selector: spec.selector, observation: spec.observation || spec.reason, criterion: spec.criterion,
      ...(spec.pair ? { pair: spec.pair } : {}), direction: spec.direction, observations };
  });
  const identical = compareRasters(output, pairs);
  for (const [i, item] of items.entries()) {
    const { spec } = specs[i];
    item.observations = item.observations.map(row => {
      if (!row.before) return row;
      const { before, fixed, pairIndex, trialIndex, ...refs } = row;
      const proof = { sameBaseline: unchanged.get(row.profile + '/' + spec.view),
        changed: !identical[pairIndex], verified: trialIndex !== null && identical[trialIndex] };
      return { ...refs, ...evaluateObservation(spec, row.active, before, fixed, proof), proof };
    });
    item.status = item.observations.every(row => row.status === 'passed') ? 'passed' : 'failed';
  }
  return items;
}

async function main(output) {
  if (!output) throw Error('Usage: node example/headline-audit/run-eval.cjs NEW-DIRECTORY');
  output = path.resolve(output);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output);
  await fs.mkdir(path.join(output, 'private'));
  run(process.execPath, [path.join(repo, 'tests/headline-eval.test.cjs')]);
  await sourceRevisions(output);
  const original = path.join(output, 'specimens/baseline');
  const packet = await discoveryPacket(plan, original, output);
  console.log('Blind discovery packet ready: ' + path.join(output, 'discovery/index.html'));
  const styles = oracle.seeds.map(s => ({ id: s.id, view: s.view, selector: s.selector,
    profiles: s.profiles, css: s.repairCSS, word: s.term.split(' ')[0], ...(s.pair ? { pair: s.pair } : {}) }));
  const variantsFile = path.join(output, 'private/variants.json');
  await writeJSON(variantsFile, styles);
  const full = await inspect(path.join(original, 'plan.json'), path.join(output, 'inspection'), ['--scope', 'all', '--variants', variantsFile]);
  const fixed = await inspect(path.join(output, 'specimens/fixed/plan.json'), path.join(output, 'retest'), ['--scope', 'all']);
  const target = path.join(original, plan.views[oracle.modeChecks.view].url);
  const profile = plan.profiles.wide;
  const viewport = ['--width', String(profile.width), '--height', String(profile.height), '--scale', String(profile.scale)];
  const hero = await inspect(target, path.join(output, 'mode-hero'), [...viewport, '--scope', 'hero']);
  const selected = await inspect(target, path.join(output, 'mode-selected'), [...viewport, '--selector', oracle.modeChecks.selected]);
  const modes = checkModes(full, hero, selected);
  const boundaries = await boundaryRetests(output);
  const cases = await score(output, full, fixed, packet);
  const rows = cases.flatMap(item => item.observations);
  const failed = cases.filter(item => item.status === 'failed').length;
  const passed = !failed && [...modes, ...boundaries].every(r => r.status === 'passed');
  const summary = { seeds: oracle.seeds.length, controls: oracle.controls.length, profiles: Object.keys(plan.profiles).length,
    views: Object.keys(plan.views).length, active: rows.filter(r => r.active).length, observations: rows.length,
    passedObservations: rows.filter(r => r.status === 'passed').length, failedCases: failed, passed };
  await writeJSON(path.join(output, 'report.json'), { profiles: plan.profiles, summary, cases, modes, boundaries,
    revisions: { baseline: 'specimens/baseline/plan.json', repaired: 'specimens/fixed/plan.json' } });
  console.log(JSON.stringify(summary));
  // Only package observed images. A missing capture stays visible in the red report.
  if (cases.every(item => item.observations.every(observation => observation.baseline && observation.repair)))
    await choicesPacket(output, cases, plan);
  run('python3', [path.join(repo, 'skills/eagle-eye/scripts/render-handoff.py'), '--headlines', path.join(output, 'inspection/report.json'),
    path.join(output, 'handoff.html'), '--eval-report', path.join(output, 'report.json')]);
  if (!passed) throw Error('Headline eval is red. Inspect ' + path.join(output, 'report.json'));
}

if (require.main === module) {
  if (process.argv.length !== 3) { console.error('Usage: node example/headline-audit/run-eval.cjs NEW-DIRECTORY'); process.exitCode = 1; }
  else main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { main, checkModes, portableReport };
