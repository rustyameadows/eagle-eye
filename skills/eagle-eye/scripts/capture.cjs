// Capture a clean, repeatable browser state. Use an interactive browser for signed-in flows.
const { parseArgs } = require('node:util');
const path = require('node:path');
const fs = require('node:fs/promises');

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      width: { type: 'string', default: '1440' },
      height: { type: 'string', default: '900' },
      scale: { type: 'string', default: '1' },
      theme: { type: 'string', default: 'light' },
      ready: { type: 'string' },
      'full-page': { type: 'boolean', default: false },
    },
  });
  if (positionals.length !== 2) throw new Error('Usage: node capture.cjs URL OUTPUT.png [--width 1440 --height 900 --scale 1 --ready SELECTOR --full-page]');
  const [url, output] = positionals;
  const width = Number(values.width);
  const height = Number(values.height);
  const scale = Number(values.scale);
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isFinite(scale) || scale <= 0)
    throw new Error('Use positive viewport dimensions and device scale.');
  if (!['light', 'dark'].includes(values.theme)) throw new Error('Use light or dark for --theme.');
  const modulePath = process.env.EAGLE_EYE_PLAYWRIGHT ||
    require.resolve('playwright', { paths: [process.cwd(), __dirname] });
  const { chromium } = require(modulePath);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height }, deviceScaleFactor: scale,
      colorScheme: values.theme, reducedMotion: 'reduce',
    });
    await page.goto(url, { waitUntil: 'load' });
    if (values.ready) await page.locator(values.ready).waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', fullPage: values['full-page'] });
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, png, { flag: 'wx' });
    console.log(JSON.stringify({
      file: output, url: page.url(), browser: 'Chromium ' + browser.version(), width, height,
      scale, theme: values.theme, fullPage: values['full-page'], reducedMotion: 'reduce',
      pixels: [png.readUInt32BE(16), png.readUInt32BE(20)],
    }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
