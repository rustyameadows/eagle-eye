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
let root, browser;

before(async () => {
  if (process.env.EAGLE_EYE_TEST_OUT) {
    root = path.resolve(process.env.EAGLE_EYE_TEST_OUT);
    await fs.mkdir(root);
  } else root = await fs.mkdtemp(path.join(os.tmpdir(), 'eagle-eye-views-'));
  await fs.copyFile(path.join(base, 'index.html'), path.join(root, 'index.html'));
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
const expectedBase = {
  wide: {
    'inbox/archive/title-inset': 3,
    'inbox/archive/title-left': 3,
    'inbox/record/toolbar-gap': -2,
    'inbox/settings/pane-left': 4,
    'inbox/settings/title-left': 4,
    'archive/inbox/title-inset': -3,
    'inbox/returned-inbox/title-inset': 2,
    'archive/returned-inbox/title-inset': -1
  },
  compact: {
    'inbox/archive/title-inset': 3,
    'inbox/archive/title-left': 3,
    'inbox/archive/row-inset': 0.5,
    'inbox/record/toolbar-gap': -2,
    'inbox/settings/action-right': -2,
    'archive/inbox/title-inset': -3,
    'archive/inbox/row-inset': -0.5,
    'inbox/returned-inbox/title-inset': 2,
    'archive/returned-inbox/title-inset': -1
  }
};
const expectedRails = {
  wide: {
    'inbox/record/toolbar-gap': -2,
    'inbox/returned-inbox/title-inset': 2,
    'archive/returned-inbox/title-inset': 2
  },
  compact: {
    'inbox/archive/row-inset': 0.5,
    'inbox/record/toolbar-gap': -2,
    'inbox/settings/action-right': -2,
    'archive/inbox/row-inset': -0.5,
    'inbox/returned-inbox/title-inset': 2,
    'archive/returned-inbox/title-inset': 2
  }
};

for (const [revision, expected] of [
  ['baseline', expectedBase],
  ['rails', expectedRails],
  ['fixed', { wide: {}, compact: {} }]
]) {
  test('rendered ' + revision + ' matrix matches the exact signed results', async () => {
    const plan = structuredClone(original);
    plan.title += ' · ' + revision;
    for (const view of Object.values(plan.views)) {
      view.url += '&revision=' + revision;
      if (view.arriveVia) view.arriveVia.url += '&revision=' + revision;
    }
    const report = await audit(revision, plan, revision === 'fixed' ? 0 : 2);
    assert.equal(report.rows.length, 40);
    for (const [profile, config] of Object.entries(plan.profiles)) {
      const rows = report.rows.filter((r) => r.profile === profile);
      assert.deepEqual(
        rows.filter((r) => r.status === 'unverified'),
        []
      );
      assert.deepEqual(
        Object.fromEntries(
          rows.filter((r) => r.status === 'drift').map((r) => [[r.from, r.to, r.check].join('/'), r.delta])
        ),
        expected[profile]
      );
      assert.deepEqual(
        rows.filter((r) => r.status === 'expected').map((r) => [r.check, r.delta]),
        [['title-top', 32]]
      );
      assert(rows.filter((r) => r.status === 'aligned').every((r) => Math.abs(r.delta) <= r.tolerance));
      assert.equal(Object.keys(report.captures[profile]).length, 5);
      for (const c of Object.values(report.captures[profile])) {
        const png = await fs.readFile(path.join(root, revision, c.file));
        assert.deepEqual(
          [png.readUInt32BE(16), png.readUInt32BE(20)],
          [config.width * config.scale, config.height * config.scale]
        );
      }
    }
    assert.match(await fs.readFile(path.join(root, revision, 'AUDIT.md'), 'utf8'), /Capture complete/);
  });
}
test('the 700/701 px boundary isolates compact and wide behavior', async () => {
  const p = structuredClone(original);
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
  const p = structuredClone(original);
  p.profiles = { wide: p.profiles.wide };
  p.views = { inbox: p.views.inbox, archive: p.views.archive };
  p.anchors = {
    missing: '.absent',
    hidden: '.hidden',
    ambiguous: '.entry',
    offscreen: '.offscreen',
    renamed: 'h1'
  };
  const custom = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  await fs.writeFile(
    path.join(root, 'visibility.html'),
    custom +
      '<div hidden class="hidden">hidden</div><div class="offscreen" style="position:absolute;top:200vh">offscreen</div>'
  );
  for (const v of Object.values(p.views)) v.url = v.url.replace('index.html', 'visibility.html');
  p.views.archive.selectors = { renamed: 'main > h1' };
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
  const p = structuredClone(original);
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
  const p = structuredClone(original);
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
