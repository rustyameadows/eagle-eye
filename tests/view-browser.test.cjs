const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const os = require('node:os');
const { launchChromium } = require('../skills/eagle-eye/scripts/browser.cjs');
const run = promisify(execFile);
const base = path.resolve(__dirname, '../example/view-audit');
const cli = path.resolve(__dirname, '../skills/eagle-eye/scripts/compare-views.cjs');
const original = require('../example/view-audit/plan.json');
const oracle = require('../example/view-audit/oracle.json');
const { scoreStage } = require('../example/view-audit/score.cjs');
const scorer = path.join(base, 'score.cjs');
let root, browser;

before(async () => {
  if (process.env.EAGLE_EYE_TEST_OUT) {
    root = path.resolve(process.env.EAGLE_EYE_TEST_OUT);
    await fs.mkdir(root);
  } else root = await fs.mkdtemp(path.join(os.tmpdir(), 'eagle-eye-views-'));
  const pages = Object.values(original.views).map((view) => view.url.split('#')[0]);
  const assets = new Set([...pages, 'fixture.css']);
  for (const stage of oracle.stages) {
    const dir = path.join(root, 'fixtures', stage);
    await fs.mkdir(dir, { recursive: true });
    for (const file of assets) {
      const source = await fs.readFile(path.join(base, file), 'utf8');
      let content = source;
      if (file.endsWith('.html')) {
        const tag = source.match(/<body\b[^>]*>/i)?.[0];
        assert.match(tag, /data-revision=(["'])baseline\1/, file + ' must expose the baseline revision');
        content = source.replace(tag, tag.replace(/data-revision=(["'])baseline\1/, 'data-revision="' + stage + '"'));
      }
      await fs.writeFile(path.join(dir, file), content);
    }
  }
  browser = await launchChromium();
});
after(async () => {
  await browser?.close();
  if (root && !process.env.EAGLE_EYE_TEST_OUT) await fs.rm(root, { recursive: true, force: true });
});
async function audit(name, plan, exitCode) {
  const input = path.join(root, name + '.json'),
    out = path.join(root, name);
  await fs.writeFile(input, JSON.stringify(plan));
  let code = 0;
  try {
    await run(process.execPath, [cli, input, out, '--fail-on-drift']);
  } catch (error) {
    code = error.code;
    if (code !== exitCode) throw error;
  }
  assert.equal(code, exitCode);
  return JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8'));
}
function stagePlan(stage = 'baseline') {
  const plan = structuredClone(original);
  plan.title += ' · ' + stage;
  for (const view of Object.values(plan.views)) {
    view.url = 'fixtures/' + stage + '/' + view.url;
    if (view.arriveVia) view.arriveVia.url = 'fixtures/' + stage + '/' + view.arriveVia.url;
  }
  return plan;
}
for (const stage of oracle.stages) {
  test('rendered ' + stage + ' matrix matches the independent signed oracle', async () => {
    const plan = stagePlan(stage);
    const report = await audit(stage, plan, stage === 'fixed' ? 0 : 2);
    const score = scoreStage(stage, report);
    assert.deepEqual(score.errors, []);
    assert.equal(score.metrics.activeSeeds + score.metrics.repairedSeeds, oracle.seeds.length);
    assert.equal(score.metrics.detectedSeeds, score.metrics.activeSeeds);
    assert.equal(score.metrics.verifiedRepairedSeeds, score.metrics.repairedSeeds);
    assert.equal(score.metrics.verifiedExpectedChanges, 3);
    for (const [profile, config] of Object.entries(plan.profiles)) {
      assert.equal(Object.keys(report.captures[profile]).length, 25);
      for (const [view, capture] of Object.entries(report.captures[profile])) {
        const via = plan.views[view].arriveVia;
        const start = via && Object.keys(plan.views).find((id) => plan.views[id].url === via.url);
        assert.equal(capture.arrival, via ? 'Link from ' + start : 'Direct entry');
        const png = await fs.readFile(path.join(root, stage, capture.file));
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)],
          [config.width * config.scale, config.height * config.scale]);
      }
    }
    assert.match(await fs.readFile(path.join(root, stage, 'AUDIT.md'), 'utf8'), /Capture complete/);
  });
}
test('the disk scorer verifies all three stages and retains cause-level results', async () => {
  await run(process.execPath, [scorer, root, path.join(root, 'score.json')]);
  const summary = JSON.parse(await fs.readFile(path.join(root, 'score.json'), 'utf8'));
  assert(summary.passed);
  assert.equal(summary.stages.baseline.metrics.activeSeeds, 16);
  assert.equal(summary.stages.rails.metrics.repairedSeeds, 6);
  assert.equal(summary.stages.fixed.metrics.remainsFixed, 6);
  assert.equal(summary.stages.fixed.metrics.verifiedRepairedSeeds, 16);
});
test('the 700/701 px boundary isolates compact and wide behavior', async () => {
  const p = stagePlan();
  p.profiles = {
    below: { width: 700, height: 640, scale: 1 },
    above: { width: 701, height: 640, scale: 1 }
  };
  p.pairs = [{ from: 'inbox', to: 'settings', checks: ['pane-left', 'action-right'] }];
  const r = await audit('boundary', p, 2);
  assert.deepEqual(
    r.rows.map((i) => i.delta),
    [0, -2, 4, 0]
  );
});
test('missing, hidden, ambiguous and offscreen anchors stay unverified; an override can map a shared role', async () => {
  const p = stagePlan();
  p.profiles = { wide: p.profiles.wide };
  p.views = { inbox: p.views.inbox, archive: p.views.archive };
  p.anchors = {
    missing: '.absent',
    hidden: '.hidden',
    ambiguous: '.entry',
    offscreen: '.offscreen',
    renamed: 'h1'
  };
  for (const [id, view] of Object.entries(p.views)) {
    const source = await fs.readFile(path.join(root, view.url), 'utf8');
    const additions = '<div hidden class="hidden">hidden</div><div class="offscreen" style="position:absolute;top:200vh">offscreen</div>';
    view.url = 'fixtures/baseline/visibility-' + id + '.html';
    await fs.writeFile(path.join(root, view.url), source.replace('</body>', additions + '</body>'));
  }
  p.views.archive.selectors = { renamed: 'main h1' };
  p.checks = Object.fromEntries(
    Object.keys(p.anchors).map((id) => [id, { label: id, point: [id, 'top'], tolerance: 0.25 }])
  );
  p.pairs = [{ from: 'inbox', to: 'archive', checks: Object.keys(p.checks) }];
  const r = await audit('visibility', p, 2);
  assert.deepEqual(
    r.rows.map((i) => i.status),
    ['unverified', 'unverified', 'unverified', 'unverified', 'aligned']
  );
  for (const row of r.rows.slice(0, 4)) {
    assert.equal(row.delta, null);
    assert(row.a.issue);
  }
  assert.match(r.rows[2].a.issue, /3 matches/);
  assert.match(r.rows[3].a.issue, /outside viewport/);
});
test('unreachable views preserve the other evidence and leave the pair unverified', async () => {
  const p = stagePlan();
  p.profiles = { wide: p.profiles.wide };
  p.views.archive.url = 'missing-file.html';
  p.pairs = [{ from: 'inbox', to: 'archive', checks: ['title-left'] }];
  const r = await audit('unreachable', p, 2);
  assert.equal(r.rows[0].status, 'unverified');
  assert(r.captures.wide.inbox.file);
  assert(r.captures.wide.archive.issue);
});
test('report viewer works offline, switches pairs and scale, and preserves a common overlay origin', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
  await page.context().setOffline(true);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(pathToFileURL(path.join(root, 'baseline/index.html')).href);
    await page.locator('#rows button').first().waitFor();
    await page.selectOption('#profile', 'compact');
    await page.selectOption('#pair', 'inbox / archive');
    await page.getByRole('button', { name: 'First label inset within row' }).click();
    assert.match(await page.locator('#numbers').innerText(), /\+0.5 CSS px/);
    assert.match(await page.locator('#styles').textContent(), /transform/);
    await page.getByRole('button', { name: 'Next issue' }).click();
    assert.notEqual(await page.locator('#selectedLabel').innerText(), 'First label inset within row');
    await page.selectOption('#pair', 'inbox / archive');
    await page.getByRole('button', { name: 'First label inset within row' }).click();
    await page.getByRole('button', { name: 'Overlay', exact: true }).click();
    await page.locator('#blend').fill('75');
    assert.deepEqual(
      await page.locator('.layer').evaluateAll((ls) => ls.map((l) => l.style.transform)),
      Array(2).fill(
        await page
          .locator('.layer')
          .first()
          .evaluate((l) => l.style.transform)
      )
    );
    assert.equal(
      await page
        .locator('.layer img')
        .last()
        .evaluate((img) => img.style.opacity),
      '0.75'
    );
    await page.locator('#guides').uncheck();
    assert.equal(await page.locator('.guide').count(), 0);
    await page.locator('#detail').uncheck();
    const transforms = await page.locator('.layer').evaluateAll((ls) => ls.map((l) => l.style.transform));
    assert.equal(transforms[0], transforms[1]);
    assert(!transforms[0].includes('scale(2)'));
    await page.getByRole('button', { name: 'Side by side' }).click();
    assert.equal(await page.locator('figure').count(), 2);
    await page.locator('#guides').check();
    await page.locator('#detail').check();
    await page.selectOption('#profile', 'wide');
    await page.selectOption('#pair', 'inbox / archive');
    assert(
      await page
        .locator('.layer img')
        .evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0))
    );
    await page.screenshot({ path: path.join(root, 'viewer.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 780 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, 'viewer-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
test('a repeated run refuses to overwrite existing evidence', async () => {
  const output = path.join(root, 'baseline');
  const before = await fs.readFile(path.join(output, 'report.json'));
  await assert.rejects(
    run(process.execPath, [cli, path.join(root, 'baseline.json'), output]),
    (e) => e.code === 1 && e.stderr.includes('EEXIST')
  );
  assert.deepEqual(await fs.readFile(path.join(output, 'report.json')), before);
});

test('incorrect navigation links cannot silently substitute a different destination', async () => {
  const p = stagePlan();
  p.profiles = { wide: p.profiles.wide };
  p.views['returned-inbox'].arriveVia.link = 'nav [data-route=settings]';
  p.pairs = [{ from: 'inbox', to: 'returned-inbox', checks: ['title-inset'] }];
  const r = await audit('wrong-link', p, 2);
  assert.equal(r.rows[0].status, 'unverified');
  assert.match(r.rows[0].b.issue, /same-tab destination/);
});

test('independent screenshot pixels confirm the 4 px desktop sidebar shift and its repair', async () => {
  const page = await browser.newPage();
  try {
    const widths = [];
    for (const revision of ['baseline', 'fixed'])
      for (const view of ['inbox', 'settings']) {
        const bytes = await fs.readFile(path.join(root, revision, 'wide', view + '.png'));
        const width = await page.evaluate(async (data) => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + data;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = 1;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, -500);
          const { data: pixels } = ctx.getImageData(0, 0, canvas.width, 1);
          let x = 0;
          while (x < canvas.width && [0, 1, 2].every((c) => pixels[4 * x + c] === pixels[c])) x++;
          return x;
        }, bytes.toString('base64'));
        assert(width > 100 && width < 300);
        widths.push(width);
      }
    assert.equal(widths[1] - widths[0], 4);
    assert.equal(widths[3] - widths[2], 0);
    assert.equal(widths[2], widths[0]);
  } finally {
    await page.close();
  }
});

test('score rejects misses, false alarms, unverified evidence, wrong signs and regressed repairs', async () => {
  const report = JSON.parse(await fs.readFile(path.join(root, 'baseline/report.json'), 'utf8'));
  const at = (r, key) => r.rows.find((row) => [row.profile, row.from, row.to, row.check].join('/') === key);
  const change = (row, delta, status) => {
    row.delta = delta;
    row.status = status;
    row.b.value = row.a.value + delta;
  };
  change(at(report, 'wide/collections/collection-detail/tree-inset'), 0, 'aligned');
  change(at(report, 'wide/collections/collection-detail/tree-inset-control'), 2, 'drift');
  change(at(report, 'compact/search/search-empty/query-inset'), -3, 'drift');
  Object.assign(at(report, 'wide/team/member/avatar-gap'), { delta: null, status: 'unverified' });
  const removed = at(report, 'compact/review/imports/footer-inset-control');
  report.rows.splice(report.rows.indexOf(removed), 1);
  const duplicate = at(report, 'wide/inbox/archive/title-left');
  report.rows.push(duplicate, { ...duplicate, check: 'spurious-check' });
  const score = scoreStage('baseline', report);
  assert.equal(score.passed, false);
  assert.equal(score.metrics.missing, 1);
  assert.equal(score.metrics.extra, 2);
  assert.equal(score.metrics.falseNegatives, 2);
  assert.equal(score.metrics.falsePositives, 3);
  assert.equal(score.metrics.unverified, 1);
  assert.equal(score.metrics.wrongDelta, 3);
  assert.equal(score.metrics.detectedSeeds, 13);
  assert(score.metrics.precision < 1 && score.metrics.recall < 1);
  const seed = (result, id) => result.seeds.find((item) => item.id === id).outcome;
  assert.equal(seed(score, 'collection-tree'), 'missed');
  assert.equal(seed(score, 'member-avatar'), 'unverified');
  assert.equal(seed(score, 'search-query'), 'incorrect-measurement');

  const fixed = JSON.parse(await fs.readFile(path.join(root, 'fixed/report.json'), 'utf8'));
  change(at(fixed, 'wide/inbox/settings/pane-left'), 4, 'drift');
  const rails = JSON.parse(await fs.readFile(path.join(root, 'rails/report.json'), 'utf8'));
  const regressed = scoreStage('fixed', fixed, scoreStage('rails', rails));
  assert.equal(regressed.passed, false);
  assert.equal(regressed.metrics.regressions, 1);
  assert.equal(regressed.metrics.falsePositives, 1);
  assert.equal(seed(regressed, 'settings-sidebar'), 'regression');
  assert.equal(seed(regressed, 'archive-content'), 'remains-fixed');

  // Exercise the CLI's failing exit status on disk without touching the original captures.
  const dir = path.join(root, 'scorer-counterexample');
  for (const stage of oracle.stages) {
    const copy = path.join(dir, stage);
    await fs.mkdir(copy, { recursive: true });
    if (stage === 'baseline' || stage === 'fixed') {
      await fs.writeFile(path.join(copy, 'report.json'), JSON.stringify(stage === 'baseline' ? report : fixed));
    } else {
      await fs.copyFile(path.join(root, stage, 'report.json'), path.join(copy, 'report.json'));
    }
  }
  const output = path.join(dir, 'score.json');
  await assert.rejects(run(process.execPath, [scorer, dir, output]), (error) => error.code === 2);
  const disk = JSON.parse(await fs.readFile(output, 'utf8'));
  assert(!disk.passed);
  assert.deepEqual(disk.stages.fixed, regressed);
});

test('a second browser rendering produces a genuine miss and false alarm against the baseline oracle', async () => {
  const directory = path.join(root, 'changed-collection');
  await fs.mkdir(directory);
  // Install the repaired fixture for this pair. Add one undeclared vertical defect to its destination.
  for (const name of ['screen-collections.html', 'screen-collection-detail.html', 'fixture.css']) {
    const source = await fs.readFile(path.join(root, 'fixtures/fixed', name), 'utf8');
    const content = name === 'screen-collection-detail.html'
      ? source.replace('</head>', '<style>.tree-label { position: relative; top: 2px; }</style></head>')
      : source;
    await fs.writeFile(path.join(directory, name), content);
  }
  const p = stagePlan('fixed');
  p.profiles = { wide: p.profiles.wide };
  p.pairs = p.pairs.filter((pair) => pair.from === 'collections' && pair.to === 'collection-detail');
  p.views = { collections: p.views.collections, 'collection-detail': p.views['collection-detail'] };
  for (const view of Object.values(p.views)) {
    view.url = view.url.replace('fixtures/fixed/', 'changed-collection/');
    if (view.arriveVia) view.arriveVia.url = view.arriveVia.url.replace('fixtures/fixed/', 'changed-collection/');
  }
  const counterexample = await audit('rendered-counterexample', p, 2);
  assert.deepEqual(counterexample.rows.map((r) => [r.check, r.status, r.delta]), [
    ['tree-inset', 'aligned', 0], ['tree-inset-control', 'drift', 2]
  ]);
  const baseline = JSON.parse(await fs.readFile(path.join(root, 'baseline/report.json'), 'utf8'));
  baseline.rows = baseline.rows.filter((r) => !(r.profile === 'wide' && r.from === 'collections' && r.to === 'collection-detail'));
  baseline.rows.push(...counterexample.rows);
  const score = scoreStage('baseline', baseline);
  assert.equal(score.passed, false);
  assert.equal(score.metrics.falseNegatives, 1);
  assert.equal(score.metrics.falsePositives, 1);
  assert.equal(score.seeds.find((s) => s.id === 'collection-tree').outcome, 'missed');
});
