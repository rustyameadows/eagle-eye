const path = require('node:path');
const { spawnSync } = require('node:child_process');

const round = number => Math.round(number * 1000) / 1000;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const graphemes = observation => observation.runs.flatMap(run => run.graphemes);
const lineTexts = observation => observation.lines.map(line => line.text);
const faces = observation => observation.fonts.map(font => font.familyName).sort();
const title = heading => heading.text.replace(/\s+/gu, ' ').trim();

function originAdvance(heading, spec) {
  const glyphs = graphemes(heading);
  const left = glyphs[spec.start], right = glyphs[spec.start + 1];
  if (!left || !right || left.text + right.text !== spec.pair)
    throw Error('Could not locate the expected pair ' + spec.pair + ' in ' + heading.text);
  if (Math.abs(left.box.y - right.box.y) > Math.min(left.box.height, right.box.height) * 0.6)
    throw Error('The measured pair straddles a line break.');
  return right.box.x - left.box.x;
}

function trackingChange(before, after) {
  const a = graphemes(before), b = graphemes(after), deltas = [];
  if (a.length !== b.length) throw Error('The number of graphemes changed.');
  for (let i = 1; i < a.length; i++) {
    if (a[i].text !== b[i].text) throw Error('Different graphemes at ' + i);
    if (/\s/u.test(a[i].text + a[i - 1].text)) continue;
    const onLine = glyphs => Math.abs(glyphs[i].box.y - glyphs[i - 1].box.y) < glyphs[i].box.height * 0.5;
    if (!onLine(a) || !onLine(b)) continue;
    const distance = glyphs => glyphs[i].box.x - glyphs[i - 1].box.x;
    deltas.push(distance(b) - distance(a));
  }
  if (deltas.length < 3) throw Error('Too few comparable within-word advances.');
  deltas.sort((x, y) => x - y);
  return { delta: deltas[Math.floor(deltas.length / 2)], deltas };
}

function largestOtherPairChange(before, after, targetIndex) {
  const a = graphemes(before), b = graphemes(after);
  let largest = 0;
  for (let i = 1; i < a.length; i++) {
    if (i - 1 === targetIndex || /\s/u.test(a[i - 1].text + a[i].text)) continue;
    if (Math.abs(a[i].box.y - a[i - 1].box.y) > a[i].box.height * 0.5) continue;
    const oldAdvance = a[i].box.x - a[i - 1].box.x;
    const newAdvance = b[i].box.x - b[i - 1].box.x;
    largest = Math.max(largest, Math.abs(newAdvance - oldAdvance));
  }
  return round(largest);
}

function evaluateObservation(spec, active, before, after, proof) {
  const failures = [];
  const check = (passed, message) => { if (!passed) failures.push(message); };
  check(title(before) === spec.text && title(after) === spec.text, 'Source wording changed or target mismatched.');
  const originalAX = before.accessibility, repairedAX = after.accessibility;
  const correctName = repairedAX.role === 'heading' ? repairedAX.name === spec.text : repairedAX.name === originalAX.name;
  check(repairedAX.role != null && originalAX.role === repairedAX.role && correctName, 'Repaired accessible name or role is incorrect.');
  check(equal(lineTexts(before), lineTexts(after)), 'Line breaks changed.');
  check(before.selection.selectable && after.selection.selectable && before.selection.text === after.selection.text, 'Text selection changed.');
  check(proof.sameBaseline, 'Inspection changed the untouched full-page raster.');
  if (active) {
    check(proof.changed, 'Applied repair had no raster effect.');
    check(proof.verified, 'Reopened source repair differs from the experimental candidate.');
  } else {
    check(!proof.changed, 'The control or inactive profile changed visually.');
    check(equal(faces(before), faces(after)), 'The control or inactive profile changed its rendered face.');
  }
  let measurement = active ? '' : 'Local crop, line breaks and rendered face preserved.';
  let values = {};
  try {
    if (active && spec.pair) {
      const original = originAdvance(before, spec), repaired = originAdvance(after, spec);
      const delta = round(repaired - original);
      values = { pair: spec.pair, original: round(original), repaired: round(repaired), delta };
      if (spec.kind === 'pair') {
        values.maxOtherPairChange = largestOtherPairChange(before, after, spec.start);
        check(values.maxOtherPairChange <= 0.125, 'The localized adjustment also moved an unrelated within-word pair.');
      }
      const sign = spec.direction === 'loose' ? -1 : 1;
      check(sign * delta >= 0.125, 'Pair movement does not meet the expected direction.');
      measurement = spec.pair + ' glyph-origin advance ' + values.original + ' → ' + values.repaired + ' CSS px.';
    } else if (active && spec.kind === 'tracking') {
      const { delta, deltas } = trackingChange(before, after);
      const sign = spec.direction === 'loose' ? -1 : 1;
      const changed = deltas.filter(value => sign * value >= 0.125).length;
      check(sign * delta >= 0.125 && changed >= deltas.length * 0.7, 'A consistent tracking correction was not observed across the word.');
      values = { medianAdvanceChange: round(delta), comparablePairs: deltas.length, changed };
      measurement = 'Median within-word advance changed by ' + round(delta) + ' CSS px across ' + deltas.length + ' pairs.';
    } else if (active && spec.kind === 'fallback') {
      const original = faces(before), repaired = faces(after);
      check(!original.includes(spec.expectedFont) && repaired.includes(spec.expectedFont), 'The intended used font was not restored.');
      values = { original, repaired };
      measurement = 'Rendered font changed from ' + original.join(', ') + ' to ' + repaired.join(', ') + '.';
    }
  } catch (error) { failures.push(error.message); }
  return { status: failures.length ? 'failed' : 'passed', measurement, values, failures,
    originalAX, repairedAX, originalLines: lineTexts(before), repairedLines: lineTexts(after), originalFaces: faces(before), repairedFaces: faces(after) };
}

// Decode PNGs rather than compare compressed bytes. Dimension changes are
// meaningful in local crops and independent capture is strict at fixed DPR.
function compareRasters(root, pairs) {
  if (!pairs.length) return [];
  const program = [
    'import json, sys, os',
    'from PIL import Image, ImageChops',
    'root, pairs = json.load(sys.stdin)',
    'results = []',
    'for a, b in pairs:',
    ' with Image.open(os.path.join(root, a)) as im_a, Image.open(os.path.join(root, b)) as im_b:',
    '  results.append(im_a.size == im_b.size and ImageChops.difference(im_a.convert("RGB"), im_b.convert("RGB")).getbbox() is None)',
    'print(json.dumps(results))'
  ].join('\n');
  const result = spawnSync('python3', ['-c', program], { encoding: 'utf8', input: JSON.stringify([path.resolve(root), pairs]), maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw Error(result.stderr || result.error?.message || 'Raster comparison failed.');
  return JSON.parse(result.stdout);
}

module.exports = { originAdvance, trackingChange, evaluateObservation, compareRasters };
