// Render the non-geometric controls against the same static pages used in the view matrix.
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchChromium } = require('../../skills/eagle-eye/scripts/browser.cjs');

const stages = ['baseline', 'rails', 'fixed'];
const cases = [
  {
    id: 'ink',
    view: 'tags',
    profile: 'compact',
    title: 'Icon ink in a centered frame',
    claim: 'The painted mark shares the vertical midpoint of its 20 px frame.'
  },
  {
    id: 'contrast',
    view: 'search-empty',
    profile: 'wide',
    title: 'Quiet text in an empty state',
    claim: 'The secondary label reaches the fixture’s 4.5 to 1 contrast threshold on its own background.'
  },
  {
    id: 'clip',
    view: 'imports',
    profile: 'compact',
    title: 'A required identifier on mobile',
    claim: 'The entire identifier remains readable inside the content area at 390 CSS px.'
  },
  {
    id: 'focus',
    view: 'member',
    profile: 'wide',
    title: 'Keyboard focus on a member link',
    claim: 'Tab reaches the link and leaves a visibly painted indicator around it.'
  },
  {
    id: 'ellipsis',
    control: true,
    view: 'record',
    profile: 'compact',
    title: 'Intentional label truncation',
    claim:
      'A secondary label uses an ellipsis by design. Its clipping is recorded as an intentional control.'
  },
  {
    id: 'sticky',
    control: true,
    view: 'observations',
    profile: 'compact',
    title: 'A two-axis sticky data table',
    claim:
      'After native horizontal and vertical scrolling, the column heading stays pinned at the corner and the sample ID column stays at its left edge.'
  },
  {
    id: 'bidi',
    control: true,
    view: 'member',
    profile: 'compact',
    title: 'Mixed-direction station instructions',
    claim:
      'The Arabic block remains right-to-left. The embedded station code is isolated and its visible bounds remain inside the text column.'
  }
];

async function controlProbe(page, spec, stage, output) {
  let measurement, issue, target;
  if (spec.id === 'sticky') {
    target = page.locator('.table-scroll');
    await target.scrollIntoViewIfNeeded();
    const measure = () =>
      target.evaluate((grid) => {
        const header = grid.querySelector('thead th').getBoundingClientRect();
        const row = grid.querySelector('tbody th').getBoundingClientRect();
        const cell = grid.querySelector('tbody td').getBoundingClientRect();
        return {
          headerX: header.x,
          headerY: header.y,
          rowX: row.x,
          cellX: cell.x,
          cellY: cell.y,
          sx: grid.scrollLeft,
          sy: grid.scrollTop
        };
      });
    const a = await measure();
    await target.evaluate((grid) => grid.scrollTo({ left: 55, top: 76, behavior: 'instant' }));
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const b = await measure();
    if (!b.sx || !b.sy) throw new Error('Fixture does not expose both native scroll axes');
    const changes = [b.headerX - a.headerX, b.headerY - a.headerY, b.rowX - a.rowX];
    issue =
      changes.some((n) => Math.abs(n) > 0.5) ||
      Math.abs(a.cellX - b.cellX - b.sx) > 0.5 ||
      Math.abs(a.cellY - b.cellY - b.sy) > 0.5;
    measurement =
      'Scrolled ' +
      b.sx +
      ' × ' +
      b.sy +
      ' CSS px · pinned-edge drift ' +
      Math.max(...changes.map(Math.abs)) +
      ' px';
  } else {
    target = page.locator('[lang=ar][dir=rtl]');
    const state = await target.evaluate((block) => {
      const code = block.querySelector('bdi');
      const range = document.createRange();
      range.selectNodeContents(code);
      const a = block.getBoundingClientRect(),
        b = range.getBoundingClientRect();
      return {
        direction: getComputedStyle(block).direction,
        mode: getComputedStyle(code).unicodeBidi,
        clipped:
          b.width <= 0 ||
          b.left < a.left - 1 ||
          b.right > a.right + 1 ||
          b.top < a.top - 1 ||
          b.bottom > a.bottom + 1
      };
    });
    issue = state.direction !== 'rtl' || state.mode !== 'isolate' || state.clipped;
    measurement =
      state.direction +
      ' · ' +
      state.mode +
      ' · ' +
      (state.clipped ? 'code outside column' : 'code inside column');
  }
  const file = stage + '-' + spec.id + '.png';
  await target.screenshot({ path: path.join(output, file), animations: 'disabled' });
  return { stage, id: spec.id, expected: false, issue, measurement, file };
}

function ratio(foreground, background) {
  const luminance = (rgb) => {
    const channels = rgb.match(/[.\d]+/g).map(Number);
    if (channels.length !== 3) throw new Error('This contrast probe requires two opaque sRGB colors.');
    const linear = channels
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [low, high] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (high + 0.05) / (low + 0.05);
}

async function probe(browser, plan, planFile, spec, stage, output) {
  const profile = plan.profiles[spec.profile];
  const page = await browser.newPage({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.scale,
    colorScheme: profile.theme || 'light',
    reducedMotion: 'reduce'
  });
  try {
    const view = plan.views[spec.view];
    await page.goto(new URL(view.url, pathToFileURL(planFile)).href);
    if (view.ready) await page.locator(view.ready).waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    if (spec.id === 'sticky' || spec.id === 'bidi') return await controlProbe(page, spec, stage, output);
    const target = page.locator('[data-visual="' + spec.id + '"]');
    if ((await target.count()) !== 1) throw new Error('Expected one visible target for ' + spec.id);
    await target.scrollIntoViewIfNeeded();
    const geometry = async () =>
      target.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          css = getComputedStyle(el);
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          color: css.color,
          background: css.backgroundColor,
          clipped: el.scrollWidth > el.clientWidth + 1,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          overflow: css.overflowX,
          ellipsis: css.textOverflow,
          whiteSpace: css.whiteSpace
        };
      });
    const opts = { type: 'png', animations: 'disabled', caret: 'hide' };
    const g = await geometry();
    if (!g.w || !g.h) throw new Error('Empty probe rectangle');
    const before = await page.screenshot(opts);
    let png = before;
    if (spec.id === 'focus') {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      let reached = false;
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        if (await target.evaluate((el) => el === document.activeElement)) {
          reached = true;
          break;
        }
      }
      if (!reached) throw new Error('Keyboard could not reach the target');
      await target.scrollIntoViewIfNeeded();
      const next = await geometry();
      if (Math.abs(next.x - g.x) > 0.01 || Math.abs(next.y - g.y) > 0.01)
        throw new Error('Focus moved the crop origin; inspect the two source states manually');
      png = await page.screenshot(opts);
    }
    // Pixel bounds and evidence crops come from original browser PNGs. The target page is never annotated.
    const evidence = await page.evaluate(
      async ({ now, initial, rect, kind, scale }) => {
        async function decode(data) {
          const img = new Image();
          img.src = 'data:image/png;base64,' + data;
          await img.decode();
          return img;
        }
        const current = await decode(now);
        const reference = initial ? await decode(initial) : null;
        const frame = {
          left: Math.round(rect.x * scale),
          top: Math.round(rect.y * scale),
          right: Math.round((rect.x + rect.w) * scale),
          bottom: Math.round((rect.y + rect.h) * scale)
        };
        const left = Math.max(0, Math.floor((rect.x - 28) * scale)),
          top = Math.max(0, Math.floor((rect.y - 18) * scale));
        const right = Math.min(current.width, Math.ceil((rect.x + rect.w + 28) * scale)),
          bottom = Math.min(current.height, Math.ceil((rect.y + rect.h + 18) * scale));
        if (left >= right || top >= bottom) throw new Error('Target outside screenshot');
        const canvas = document.createElement('canvas');
        canvas.width = right - left;
        canvas.height = bottom - top;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(current, -left, -top);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let offset, changed;
        if (kind === 'ink') {
          let first = Infinity,
            last = -1;
          for (let y = frame.top; y < frame.bottom; y++)
            for (let x = frame.left; x < frame.right; x++) {
              const i = ((y - top) * canvas.width + x - left) * 4;
              if ([37, 76, 60].every((color, c) => Math.abs(pixels[i + c] - color) <= 18)) {
                first = Math.min(first, y);
                last = Math.max(last, y);
              }
            }
          if (last < first) throw new Error('Target ink is absent in captured frame');
          offset = ((last + 1 + first) / 2 - (frame.top + frame.bottom) / 2) / scale;
          ctx.strokeStyle = '#a3314c';
          ctx.lineWidth = 1;
          ctx.setLineDash([3 * scale, 2 * scale]);
          ctx.beginPath();
          const y = (frame.top + frame.bottom) / 2 - top;
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        } else if (kind === 'focus') {
          const previous = document.createElement('canvas');
          previous.width = canvas.width;
          previous.height = canvas.height;
          const c = previous.getContext('2d');
          c.drawImage(reference, -left, -top);
          const prior = c.getImageData(0, 0, canvas.width, canvas.height).data;
          changed = 0;
          for (let y = top; y < bottom; y++)
            for (let x = left; x < right; x++) {
              const withinRing =
                x >= frame.left - 6 * scale &&
                x < frame.right + 6 * scale &&
                y >= frame.top - 6 * scale &&
                y < frame.bottom + 6 * scale;
              if (!withinRing || (x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom))
                continue;
              const i = ((y - top) * canvas.width + x - left) * 4;
              if ([0, 1, 2].some((c) => Math.abs(prior[i + c] - pixels[i + c]) >= 32)) changed++;
            }
        }
        return { offset, changed, image: canvas.toDataURL('image/png').split(',')[1] };
      },
      {
        now: png.toString('base64'),
        initial: spec.id === 'focus' ? before.toString('base64') : null,
        rect: g,
        kind: spec.id,
        scale: profile.scale
      }
    );
    let issue, measurement;
    if (spec.id === 'ink') {
      issue = Math.abs(evidence.offset) > 0.25;
      measurement = (evidence.offset > 0 ? '+' : '') + evidence.offset + ' CSS px from center';
    } else if (spec.id === 'contrast') {
      const value = ratio(g.color, g.background);
      issue = value < 4.5;
      measurement = value.toFixed(2) + ' to 1';
    } else if (spec.id === 'focus') {
      issue = evidence.changed < Math.ceil(g.w * profile.scale);
      measurement = evidence.changed + ' changed ring pixels';
    } else if (spec.id === 'clip') {
      issue = g.clipped;
      measurement = g.scrollWidth + ' px of content · ' + g.clientWidth + ' px available';
    } else {
      if (!g.clipped || g.ellipsis !== 'ellipsis' || !['hidden', 'clip'].includes(g.overflow))
        throw new Error('Expected intentional ellipsis sample unavailable');
      issue = false;
      measurement = 'Declared ellipsis · ' + g.scrollWidth + ' px inside ' + g.clientWidth + ' px';
    }
    if (spec.id === 'focus') {
      await fs.writeFile(path.join(output, stage + '-member-before.png'), before);
      await fs.writeFile(path.join(output, stage + '-member-keyboard.png'), png);
    }
    const file = stage + '-' + spec.id + '.png';
    await fs.writeFile(path.join(output, file), Buffer.from(evidence.image, 'base64'));
    return {
      stage,
      id: spec.id,
      expected: stage !== 'fixed' && !spec.control,
      issue,
      measurement,
      file
    };
  } finally {
    await page.close();
  }
}

const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
function verdict(result) {
  if (result.error) return 'Unverified';
  if (result.issue !== result.expected) return result.issue ? 'Unexpected flag' : 'Missed';
  if (result.issue) return 'Detected';
  return result.id === 'ellipsis' ? 'Intentional' : 'Verified clear';
}

function render(result) {
  const cards = cases
    .map((item) => {
      const measurements = result.rows
        .filter((row) => row.id === item.id)
        .map(
          (row) =>
            '<figure><figcaption>' +
            escapeHTML(row.stage) +
            ' · ' +
            verdict(row) +
            '</figcaption>' +
            (row.file
              ? '<img alt="' +
                escapeHTML(item.title + ' at ' + row.stage) +
                '" src="' +
                escapeHTML(row.file) +
                '">'
              : '') +
            '<p>' +
            escapeHTML(row.error || row.measurement) +
            '</p></figure>'
        )
        .join('');
      return (
        '<section><h2>' +
        escapeHTML(item.title) +
        '</h2><p>' +
        escapeHTML(item.claim) +
        '</p><div class="strip">' +
        measurements +
        '</div></section>'
      );
    })
    .join('');
  return (
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Paint, content and focus checks</title><style>' +
    ':root{font-family:system-ui,sans-serif;color:#243729;background:#f5f5ee}body{max-width:1050px;margin:auto;padding:clamp(15px,4vw,50px)}header,section{padding:20px 0;border-bottom:1px solid #cbd4c8}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:clamp(30px,5vw,55px);margin:10px 0}p{line-height:1.5}.strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0;padding:12px;background:white;overflow-wrap:anywhere}figure img{max-width:100%;max-height:130px;object-fit:contain;display:block;margin:12px 0}figcaption{font-weight:650}a{color:#1a573a}@media(max-width:650px){.strip{grid-template-columns:1fr}}@media print{section{break-inside:avoid}}</style>' +
    '<header><p>Eagle Eye / Fieldwork eval</p><h1>Paint, content and focus</h1><p>' +
    result.rows.filter((r) => !r.error && r.issue === r.expected).length +
    ' of ' +
    result.rows.length +
    ' observations matched the fixture expectations across three revisions. These checks inspect raster ink, text color, content bounds, keyboard focus, two-axis scrolling and mixed-direction text.</p></header>' +
    cards +
    '<p><a href="results.json">Exact observations</a></p></html>'
  );
}
async function main() {
  const [run] = process.argv.slice(2);
  if (!run) throw new Error('Usage: node visual-review.cjs RUN-DIR');
  const root = path.resolve(run),
    output = path.join(root, 'visual-review');
  await fs.mkdir(output);
  const browser = await launchChromium();
  const rows = [];
  try {
    for (const stage of stages) {
      const file = path.join(root, stage + '.json');
      const plan = JSON.parse(await fs.readFile(file, 'utf8'));
      for (const item of cases) {
        try {
          rows.push(await probe(browser, plan, file, item, stage, output));
        } catch (error) {
          rows.push({
            id: item.id,
            stage,
            expected: stage !== 'fixed' && !item.control,
            error: error.message.split('\n')[0]
          });
        }
      }
    }
  } finally {
    await browser.close();
  }
  const result = { browser: 'Chromium ' + browser.version(), cases, rows };
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'index.html'), render(result));
  const failed = rows.filter((row) => row.error || row.expected !== row.issue);
  console.log(
    'Paint/content/focus: ' + (rows.length - failed.length) + '/' + rows.length + ' expected observations'
  );
  for (const row of failed) console.error(row.stage, row.id, verdict(row), row.error || row.measurement);
  if (failed.length) process.exitCode = 2;
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { ratio, verdict, cases };
