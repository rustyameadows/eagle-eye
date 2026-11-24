const path = require('node:path');

function launchChromium() {
  const packagePath =
    process.env.EAGLE_EYE_PLAYWRIGHT ||
    require.resolve('playwright', { paths: [process.cwd(), __dirname] });
  return require(packagePath).chromium.launch();
}

async function openView(page, url, ready) {
  const response = await page.goto(url, { waitUntil: 'load' });
  if (response && response.status() >= 400) throw new Error('HTTP ' + response.status());
  if (ready) await page.locator(ready).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

module.exports = { launchChromium, openView };
