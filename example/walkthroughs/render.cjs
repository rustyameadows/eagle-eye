// Run against the Stageshow authoring preview. The generated images work offline.
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { launchChromium } = require('../../skills/eagle-eye/scripts/browser.cjs');

// Sample movement at 10 fps. The encoder holds each still until the next beat.
const walkthroughs = ['example-4-tab', 'example-4-list', 'example-2', 'example-3', 'example-1'];
const times = Array.from({ length: 102 }, (_, index) => index * 100).filter(time =>
  time === 0 || time === 3200 || time === 7200 ||
  (time >= 700 && time <= 2600) || (time >= 4600 && time <= 5800) || time >= 9100
);

async function render() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, options: { format: { type: 'string' } }
  });
  const [url, ...selection] = positionals;
  const preview = new URL(url);
  const subjects = selection.length ? selection : walkthroughs;
  const formats = {
    wide: { width: 850, scale: 1 }, compact: { width: 390, scale: 1 }, square: { width: 432, scale: 2.5 }
  };
  if (values.format && !Object.hasOwn(formats, values.format)) throw Error('Unknown export format');
  const selectedFormats = values.format ? [values.format] : Object.keys(formats);
  if (subjects.some(subject => !walkthroughs.includes(subject))) throw Error('Unknown walkthrough');
  const frames = await fs.mkdtemp(path.join(os.tmpdir(), 'eagle-eye-walkthrough-'));
  const browser = await launchChromium();
  try {
    for (const format of selectedFormats) {
      const { width, scale } = formats[format];
      const page = await browser.newPage({ viewport: { width, height: 640 }, deviceScaleFactor: scale });
      preview.searchParams.set('format', format);
      for (const subject of subjects) {
        const directory = path.join(frames, subject + '-' + format);
        await fs.mkdir(directory);
        preview.searchParams.set('frames', '1');
        preview.searchParams.set('subject', subject);
        await page.goto(preview.href);
        const stage = page.locator('.ss-stage');
        await stage.locator('svg[role="img"]').waitFor();
        await page.evaluate(async () => {
          await document.fonts.ready;
          const sources = new Set(Array.from(document.querySelectorAll('svg image'), el => el.getAttribute('href')));
          await Promise.all(Array.from(sources, src => {
            const img = new Image();
            img.src = src;
            return img.decode();
          }));
        });
        for (const time of times) {
          await page.evaluate(async t => {
            window.dispatchEvent(new CustomEvent('eagle-seek', { detail: t }));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }, time);
          await stage.screenshot({ path: path.join(directory, time + '.png') });
        }
        // The guides are fully retracted. Repeat the opening capture exactly
        // so a browser's subpixel rasterization cannot flicker across the seam.
        await fs.copyFile(path.join(directory, '0.png'), path.join(directory, '10200.png'));
      }
      await page.close();
    }
    execFileSync('python3', [path.join(__dirname, 'encode.py'), frames, ...subjects, '--formats', ...selectedFormats], { stdio: 'inherit' });
  } finally {
    await browser.close();
    await fs.rm(frames, { recursive: true, force: true });
  }
}

render().catch(error => { console.error(error); process.exitCode = 1; });
