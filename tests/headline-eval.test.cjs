const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { evaluateObservation, trackingChange, originAdvance } = require('../example/headline-audit/score.cjs');
const { choicesPacket } = require('../example/headline-audit/packets.cjs');

function heading(text, positions) {
  return { text, runs: [{ graphemes: [...text].map((letter, i) => ({
    text: letter, box: { x: positions[i], y: 80, width: 12, height: 40 }
  })) }], lines: [{ text }], accessibility: { role: 'heading', name: text },
  selection: { text, selectable: true }, fonts: [{ familyName: 'Serif' }] };
}

const pair = { text: 'Tow', pair: 'To', start: 0, kind: 'pair', direction: 'loose' };
const positive = { sameBaseline: true, changed: true, verified: true };
test('a page origin shift cannot impersonate a repaired pair', () => {
  const a = heading('Tow', [5, 25, 39]), b = heading('Tow', [105, 125, 139]);
  assert.equal(originAdvance(a, pair), originAdvance(b, pair));
  assert.equal(evaluateObservation(pair, true, a, b, positive).status, 'failed');
  assert.equal(evaluateObservation(pair, true, a, heading('Tow', [105, 121, 135]), positive).status, 'passed');
});

test('whole-word tracking needs a change across multiple within-word intervals', () => {
  const text = 'Water', a = heading(text, [8, 23, 38, 53, 68]);
  const many = heading(text, [8, 21, 34, 47, 60]);
  const one = heading(text, [8, 21, 36, 51, 66]);
  const spec = { text, kind: 'tracking', direction: 'loose' };
  assert.equal(trackingChange(a, many).delta, -2);
  assert.equal(evaluateObservation(spec, true, a, many, positive).status, 'passed');
  assert.equal(evaluateObservation(spec, true, a, one, positive).status, 'failed');
});

test('a successful signed correction still fails if copy, accessible name, reopened pixels, or baseline changed', () => {
  const a = heading('Tow', [5, 25, 40]), b = heading('Tow', [5, 20, 35]);
  for (const proof of [{ ...positive, verified: false }, { ...positive, sameBaseline: false }])
    assert.equal(evaluateObservation(pair, true, a, b, proof).status, 'failed');
  b.accessibility.name = 'T ow';
  assert.equal(evaluateObservation(pair, true, a, b, positive).status, 'failed');
  b.accessibility.name = 'Tow';
  b.selection.text = 'T ow';
  assert.equal(evaluateObservation(pair, true, a, b, positive).status, 'failed');
});

test('a local fix preserves unflagged pairs and original wrapping', () => {
  const before = heading('Tow', [5, 25, 40]);
  const collateral = heading('Tow', [5, 20, 40]);
  const outcome = evaluateObservation(pair, true, before, collateral, positive);
  assert.equal(outcome.status, 'failed');
  assert.match(outcome.failures.join(' '), /unrelated within-word pair/);
  const wrapped = heading('Tow', [5, 20, 35]);
  wrapped.lines = [{ text: 'To' }, { text: 'w' }];
  assert.equal(evaluateObservation(pair, true, before, wrapped, positive).status, 'failed');
});

test('correcting an inline shaping boundary may also restore a broken accessible name', () => {
  const before = heading('Tow', [5, 25, 40]), after = heading('Tow', [5, 20, 35]);
  before.accessibility.name = 'T ow';
  assert.equal(evaluateObservation(pair, true, before, after, positive).status, 'passed');
  after.accessibility.name = before.accessibility.name;
  assert.equal(evaluateObservation(pair, true, before, after, positive).status, 'failed');
});

test('unchanged negative controls and actual rendered fallback have different requirements', () => {
  const a = heading('Tow', [5, 25, 40]), b = heading('Tow', [5, 20, 35]);
  const spec = { text: 'Tow', kind: 'fallback', expectedFont: 'Intended' };
  assert.equal(evaluateObservation(spec, false, a, a, { ...positive, changed: false }).status, 'passed');
  assert.equal(evaluateObservation(spec, false, a, a, positive).status, 'failed');
  assert.equal(evaluateObservation(spec, true, a, b, positive).status, 'failed');
  b.fonts[0].familyName = 'Intended';
  assert.equal(evaluateObservation(spec, true, a, b, positive).status, 'passed');
});

test('public choice packets hide assignments, counterbalance repairs and include identical controls', async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'headline-choices-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await fs.mkdir(path.join(tmp, 'private'));
  const source = Buffer.alloc(30);
  source.writeUInt32BE(784, 16);
  await fs.writeFile(path.join(tmp, 'original.png'), source);
  source.write('fixed', 23);
  await fs.writeFile(path.join(tmp, 'repaired.png'), source);
  const rows = (kind, n) => Array.from({ length: n }, (_, i) => ({
    kind, id: kind + i, observations: [{ active: kind === 'seed', profile: 'compact',
      baseline: 'original.png', repair: 'repaired.png' }]
  }));
  await choicesPacket(tmp, [...rows('seed', 6), ...rows('control', 4)], { profiles: { compact: { scale: 2 } } });
  const read = async file => JSON.parse(await fs.readFile(path.join(tmp, file), 'utf8'));
  const { items } = await read('choices/manifest.json'), key = (await read('private/choices.json')).items;
  assert.equal(items.length, 9);
  assert.equal(key.filter(r => r.candidate === 'A').length, 3);
  assert.equal(key.filter(r => r.candidate === 'B').length, 3);
  assert.equal(key.filter(r => r.control).length, 3);
  for (const row of items) {
    assert.deepEqual(Object.keys(row).sort(), ['A', 'B', 'id', 'widthA', 'widthB']);
    assert.equal(row.widthA, 392);
    const a = await fs.readFile(path.join(tmp, 'choices', row.A));
    const b = await fs.readFile(path.join(tmp, 'choices', row.B));
    const assignment = key.find(k => k.id === row.id);
    assert.equal(a.equals(b), assignment.control);
    if (!assignment.control) assert.equal((assignment.candidate === 'A' ? a : b).toString('utf8', 23, 28), 'fixed');
  }
});
