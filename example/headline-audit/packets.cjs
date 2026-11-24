const fs = require('node:fs/promises');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { launchChromium, openView } = require('../../skills/eagle-eye/scripts/browser.cjs');

async function writeJSON(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

function shuffle(items) {
  const list = [...items];
  for (let end = list.length - 1; end > 0; end--) {
    const other = randomInt(end + 1);
    [list[other], list[end]] = [list[end], list[other]];
  }
  return list;
}

const number = (i) => String(i + 1).padStart(3, '0');
const galleryStyle = 'body{font:16px/1.5 system-ui;margin:24px;color:#262824;background:#eeeae1}section{padding:16px;margin:0 0 32px;background:white}img{display:block;height:auto;margin:10px 0 24px}h1,h2{font-weight:600}a{color:inherit}.scroll{overflow:auto}';

async function discoveryPacket(plan, base, output) {
  const dir = path.join(output, 'discovery');
  await fs.mkdir(dir);
  const manifest = { items: [] };
  const key = { items: [] };
  const tasks = Object.keys(plan.views).flatMap(view =>
    Object.keys(plan.profiles).map(profile => ({ view, profile })));
  const browser = await launchChromium();
  try {
    for (const [i, { view, profile }] of shuffle(tasks).entries()) {
      const id = 'P' + number(i);
      const { width, height, scale } = plan.profiles[profile];
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
      try {
        const source = plan.views[view];
        await openView(page, pathToFileURL(path.resolve(base, source.url)).href, source.ready);
        const file = id + '.png';
        await page.screenshot({ path: path.join(dir, file), fullPage: true, animations: 'disabled', caret: 'hide' });
        manifest.items.push({ id, file, width, height, scale });
        key.items.push({ id, view, profile });
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  await writeJSON(path.join(dir, 'manifest.json'), manifest);
  await writeJSON(path.join(output, 'private/discovery.json'), key);
  const pages = manifest.items.map(item =>
    '<section><h2>' + item.id + ' · ' + item.width + ' × ' + item.height + '</h2><div class="scroll"><a href="' + item.file + '"><img loading="lazy" width="' + item.width + '" src="' + item.file + '" alt="Capture ' + item.id + '"></a></div></section>');
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Headline review</title><style>' + galleryStyle + '</style><h1>Headline review</h1><p>Read at normal size. Record the page ID, exact word, and direction of each visible spacing issue. Record uncertain causes separately.</p>' + pages.join('\n'));
  return { manifest, key };
}

// Each active seed has one trial. Identical image pairs check whether a reviewer
// can decline a preference. Counterbalance the active candidates across A and B.
async function choicesPacket(output, cases, plan) {
  const dir = path.join(output, 'choices');
  await fs.mkdir(dir);
  const seeds = cases.filter(item => item.kind === 'seed');
  const controls = cases.filter(item => item.kind === 'control');
  const sides = shuffle(seeds.map((_, i) => i % 2 ? 'A' : 'B'));
  const trials = seeds.map((item, i) => ({ item, observation: item.observations.find(r => r.active), side: sides[i] }));
  for (const [i, item] of shuffle(controls).slice(0, 3).entries())
    trials.push({ item, observation: item.observations[i % item.observations.length], side: null });
  const manifest = { items: [] };
  const key = { items: [] };
  for (const [index, { item, observation, side }] of shuffle(trials).entries()) {
    const id = 'T' + number(index);
    const trial = { id };
    for (const label of ['A', 'B']) {
      const ref = label === side ? observation.repair : observation.baseline;
      const png = await fs.readFile(path.join(output, ref));
      const file = id + '-' + label + '.png';
      await fs.writeFile(path.join(dir, file), png);
      trial[label] = file;
      trial['width' + label] = png.readUInt32BE(16) / plan.profiles[observation.profile].scale;
    }
    manifest.items.push(trial);
    key.items.push({ id, caseId: item.id, profile: observation.profile, candidate: side, control: side === null });
  }
  await writeJSON(path.join(dir, 'manifest.json'), manifest);
  await writeJSON(path.join(output, 'private/choices.json'), key);
  const rows = manifest.items.map(item => '<section><h2>' + item.id + '</h2><div class="scroll">' +
    ['A', 'B'].map(label => '<strong>' + label + '</strong><img width="' + item['width' + label] + '" src="' + item[label] + '" alt="' + label + '">').join('') + '</div></section>');
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reading comparison</title><style>' + galleryStyle + '</style><h1>Reading comparison</h1><p>Read each title at the displayed size. Choose A, B, or no preference. Record the word and what changed your reading.</p>' + rows.join('\n'));
}

module.exports = { discoveryPacket, choicesPacket, writeJSON };
