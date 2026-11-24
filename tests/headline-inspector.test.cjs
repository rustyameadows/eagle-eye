const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { launchChromium, openView } = require('../skills/eagle-eye/scripts/browser.cjs');
const run = promisify(execFile),
  cli = path.resolve(__dirname, '../skills/eagle-eye/scripts/inspect-headlines.cjs');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Heading sample</title>
<style>body {margin:18px; background:#fff;color:#182d37} h1,p{font:46px "DejaVu Serif",serif;margin:.5em 0}
#title span{margin-inline-start:.16em} h2{font:19px "DejaVu Sans",sans-serif}
#end{margin-top:820px} .credit{font:12px sans-serif}</style>
<h1 id="title">T<span>oday</span> in April</h1>
<p id="display">Field <em>Journal</em></p><span class="credit">Editor’s desk</span>
<h2 id="end">An office cafe<span>́</span></h2><h3 hidden>Invisible</h3></html>`;
let root, url, all, report, heading;
async function inspect(name, target, args = []) {
  const out = path.join(root, name);
  await run(process.execPath, [cli, target, out, ...args]);
  return JSON.parse(await fs.readFile(path.join(out, 'report.json'), 'utf8'));
}
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'eagle-headline-test-'));
  const page = path.join(root, 'index.html');
  await fs.writeFile(page, html);
  url = pathToFileURL(page).href;
  const variants = path.join(root, 'variants.json');
  await fs.writeFile(
    variants,
    JSON.stringify([
      {
        id: 'repair',
        selector: '#title',
        word: 'Today',
        pair: 'To',
        css: '#title span {margin-inline-start:0}'
      }
    ])
  );
  report = await inspect('all', url, [
    '--scope',
    'all',
    '--width',
    '500',
    '--height',
    '650',
    '--scale',
    '2',
    '--variants',
    variants
  ]);
  all = report.captures.default.page;
  heading = all.headings.find((h) => h.selector === '#title');
});
after(async () => {
  if (root) await fs.rm(root, { force: true, recursive: true });
});
test('all covers semantic headings, visual display copy and below-fold text', async () => {
  assert.deepEqual(
    all.headings.map((h) => h.selector),
    ['#title', '#display', '#end']
  );
  const below = all.headings[2];
  assert.ok(below.box.y > 650);
  assert.ok(below.runs.flatMap((r) => r.graphemes).some((g) => g.text === 'é'));
  assert.equal(heading.accessibility.role, 'heading');
  assert.equal(heading.accessibility.name, 'Today in April');
  assert.equal(heading.selection.selectable, true);
  assert.equal(heading.selection.text, 'Today in April');
  assert.equal(heading.styles['font-kerning'], 'auto');
  assert.ok(heading.fonts.some((f) => f.familyName === 'DejaVu Serif'));
  assert.equal(
    heading.fonts.reduce((n, f) => n + f.glyphCount, 0),
    heading.text.length
  );
  assert.deepEqual(
    heading.fontRuns.map((r) => r.text),
    ['T', 'oday', ' in April']
  );
  for (const file of report.contactSheets.default) await fs.access(path.join(root, 'all', file));
});
test('the captured baseline equals an independently rendered untouched full page pixel for pixel', async () => {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({
      viewport: { width: 500, height: 650 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce'
    });
    await openView(page, url);
    const independent = await page.screenshot({
      type: 'png',
      fullPage: true,
      animations: 'disabled',
      caret: 'hide'
    });
    assert.deepEqual(await fs.readFile(path.join(root, 'all', all.file)), independent);
  } finally {
    await browser.close();
  }
});
test('a targeted A/B keeps the entire word, attributes the pair and records equal crop dimensions', async () => {
  const variant = heading.variants[0];
  assert.equal(variant.id, 'repair');
  assert.equal(variant.text, heading.text);
  assert.deepEqual(variant.accessibility, heading.accessibility);
  assert.deepEqual(variant.selection, heading.selection);
  const [before, after] = [heading, variant].map((h) =>
    h.details.find((d) => d.word === 'Today' && d.pair === 'To')
  );
  assert.ok(before.rangeGap > 5 && Math.abs(after.rangeGap) < 1);
  assert.ok(heading.suspects.some((s) => s.pair === 'To'));
  assert.deepEqual(
    variant.lines.map((l) => l.text),
    heading.lines.map((l) => l.text)
  );
  const crop = variant.comparison;
  const files = await Promise.all(
    [crop.original, crop.file].map((f) => fs.readFile(path.join(root, 'all', f)))
  );
  assert.notDeepEqual(files[0], files[1]);
  assert.equal(files[0].readUInt32BE(16), files[1].readUInt32BE(16));
  assert.equal(files[0].readUInt32BE(20), files[1].readUInt32BE(20));
  assert.equal(files[0].readUInt32BE(16), crop.box.width * 2);
});
test('hero is the default and named selector can target another rendered heading', async () => {
  const h = await inspect('heroes', url),
    s = await inspect('single', url, ['--selector', '#end']);
  assert.deepEqual(
    h.captures.default.page.headings.map((h) => h.selector),
    ['#title', '#display']
  );
  assert.deepEqual(
    s.captures.default.page.headings.map((h) => h.selector),
    ['#end']
  );
  await assert.rejects(run(process.execPath, [cli, url, path.join(root, 'single')]), /EEXIST/);
});
test('a plan preserves native link arrivals, profile dimensions and color scheme', async () => {
  await fs.writeFile(path.join(root, 'entry.html'), '<a href="index.html">Read</a>');
  const p = path.join(root, 'plan.json');
  await fs.writeFile(
    p,
    JSON.stringify({
      title: 'Two entries',
      profiles: { narrow: { width: 425, height: 650, scale: 1, theme: 'dark' } },
      views: {
        arrival: { url: 'index.html', ready: '#title', arriveVia: { url: 'entry.html', link: 'a' } }
      }
    })
  );
  const r = await inspect('arrived', p, ['--selector', '#title']);
  assert.equal(r.captures.narrow.arrival.arrival, 'link');
  assert.equal(r.captures.narrow.arrival.url, url);
});

test('a compact nonsemantic lead can outrank smaller main copy without pulling in navigation', async () => {
  const compact = path.join(root, 'compact.html');
  await fs.writeFile(
    compact,
    '<!doctype html><style>body{font-size:15px} p{font-size:24px} #lead{font-size:28px} nav span{font-size:28px}</style><nav><span>Menu</span></nav><main><div id="lead">Under a winter sky</div><p>A short introduction</p></main>'
  );
  const r = await inspect('compact', compact, ['--width', '390', '--height', '720']);
  assert.deepEqual(
    r.captures.default.page.headings.map((h) => h.selector),
    ['#lead']
  );
});

test('focused proof preserves every boundary and measures local changes against a repeated control', async () => {
  const page = path.join(root, 'study.html');
  await fs.writeFile(page, `<!doctype html><meta charset="utf-8"><style>
    h1{font:52px "DejaVu Serif",serif;letter-spacing:normal;color:#252221;background:#f6efe9}
    #expanded{margin-inline-start:.25em}
    </style><h1 id="proof">L’<span id="expanded">été</span> · L’été</h1>
    <h1 id="wrap">Cloud<br>River</h1><h1 id="joined" lang="ar" dir="rtl">نهر</h1>`);
  const variants = path.join(root, 'proof-variants.json');
  await fs.writeFile(variants, JSON.stringify([
    {id:'native',selector:'#proof',css:'#expanded { margin-inline-start:0 }'}
  ]));
  const inspected = await inspect('study', page, ['--selector','h1','--variants',variants]);
  const [observed, wrapped, joined] = inspected.captures.default.page.headings;
  const letters = [...new Intl.Segmenter('fr',{granularity:'grapheme'}).segment(observed.text)].map(v => v.segment);
  const records = observed.proof.boundaries;
  assert.deepEqual(records.map(b => [b.index,b.left,b.right]),
    letters.slice(1).map((right,i) => [i+1,letters[i],right]));
  assert.equal(records.filter(b=>b.kind==='word-space').length,4);
  const target = bs=>bs.filter(b=>b.left==='’' && b.right==='é');
  const [first, control] = target(records);
  const [fixed, unchanged] = target(observed.variants[0].proof.boundaries);
  assert.notEqual(first.start,control.start);
  assert.equal(first.kind,'punctuation');
  assert.equal(first.word,'L’été');
  assert.equal(first.method,'column-clearance');
  assert.ok(first.columnClearance.cssPx > fixed.columnClearance.cssPx + 11);
  assert.equal(unchanged.columnClearance.cssPx,control.columnClearance.cssPx);
  assert.ok(first.rangeGap - fixed.rangeGap > 12);
  assert.deepEqual(records.map(b=>b.index), observed.variants[0].proof.boundaries.map(b=>b.index));
  assert.notEqual(first.detailFile,control.detailFile);
  const rendered = [observed, observed.variants[0], wrapped, joined];
  for (const item of rendered) {
    for (const file of [...item.proof.sheets, ...item.proof.words.map(w=>w.file)]) {
      const png = await fs.readFile(path.join(root,'study',file));
      assert.ok(png.readUInt32BE(16)>0 && png.readUInt32BE(20)>0);
    }
  }
  assert.equal(wrapped.proof.boundaries.find(b=>b.left==='d' && b.right==='R').method,'line-break');
  assert.ok(joined.proof.boundaries.every(b=>b.method==='visual-only' && b.columnClearance===null));
  assert.equal(observed.text,observed.variants[0].text);
  assert.deepEqual(observed.accessibility,observed.variants[0].accessibility);
  assert.deepEqual(observed.selection,observed.variants[0].selection);
  assert.equal(heading.proof,undefined); // broad baseline stays lightweight
});
