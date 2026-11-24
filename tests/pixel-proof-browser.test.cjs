// Exercise real file:// delivery, native pixel sampling and reading scale.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');
const {launchChromium} = require('../skills/eagle-eye/scripts/browser.cjs');

test('offline proof preserves samples, zoom grid coordinates and capture scale', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'headline-pixel-test-'));
  t.after(() => fs.rm(dir, {recursive:true, force:true}));
  const stages = [{id:'before',label:'Original'}, {id:'live',label:'Live'}, {id:'trial',label:'Trial'}];
  const images = Object.fromEntries(stages.map(s => [s.id, s.id + '.png']));
  const regions = [{label:'Edge',x:1,y:1,width:5,height:2}];
  const profiles = [1,2].map(scale => ({id:'p'+scale,label:scale+'×',scale,images,regions,origin:{x:10,y:20}}));
  await fs.writeFile(path.join(dir,'manifest.json'), JSON.stringify({title:'Reading proof',stages,profiles}));
  execFileSync('python3',['-c',[
    'from pathlib import Path',
    'from PIL import Image',
    'im=Image.new("RGB", (12,6),(255,255,255)); im.save("before.png")',
    'im.putpixel((2,1),(100,45,130)); im.save("live.png")',
    'im.putpixel((2,1),(102,41,133)); im.save("trial.png")'
  ].join('\n')], {cwd:dir});
  execFileSync('python3',[path.join(__dirname,'../skills/eagle-eye/scripts/pixel-proof.py'),'manifest.json','proof'], {cwd:dir});
  const browser = await launchChromium();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:390,height:800}});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const url = pathToFileURL(path.join(dir,'proof/index.html'));
  url.searchParams.set('profile', 'p2');
  await page.goto(url.href);
  assert.equal(await page.locator('#profile').inputValue(), '1');
  assert.equal(await page.locator('.readings canvas').first().evaluate(c => c.getBoundingClientRect().width), 6);
  assert.equal(await page.locator('#comparison option:checked').innerText(), 'Live → Trial');
  await page.locator('#x').fill('2');
  await page.locator('#y').fill('1');
  await page.locator('#locate').click();
  assert.match(await page.locator('#values').innerText(), /RGBA\(102, 41, 133, 255\)/);
  assert.match(await page.locator('#selection').innerText(), /viewport CSS \(11, 20.5\).*Darker.*\(\+2, -4, \+3\)/);
  await page.selectOption('#zoom','16');
  await page.selectOption('#layer','stage-2');
  await page.locator('#inspection').click({position:{x:2*16+5,y:16+5}});
  assert.match(await page.locator('#selection').innerText(), /Pixel \(2, 1\)/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#selection').innerText(), /Pixel \(3, 1\).*Unchanged/);
  await page.selectOption('#region','0');
  assert.match(await page.locator('#regional').innerText(), /1 changed, 9 unchanged/);
  await page.selectOption('#comparison','0');
  await page.locator('#x').fill('2');
  await page.locator('#y').fill('1');
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#selection').innerText(), /\(-155, -210, -125\)/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
});
