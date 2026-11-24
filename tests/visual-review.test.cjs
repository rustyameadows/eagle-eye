const test = require('node:test');
const assert = require('node:assert/strict');
const { ratio, verdict } = require('../example/view-audit/visual-review.cjs');

test('contrast is symmetric and uses the nonlinear sRGB response', () => {
  assert.equal(ratio('rgb(0, 0, 0)', 'rgb(255, 255, 255)'), 21);
  assert.equal(ratio('rgb(255, 255, 255)', 'rgb(0, 0, 0)'), 21);
  assert(Math.abs(ratio('rgb(119, 119, 119)', 'rgb(255, 255, 255)') - 4.478) < 0.002);
});
test('a missing observation or missed seed never counts as a verified result', () => {
  assert.equal(verdict({ error: 'missing', expected: true }), 'Unverified');
  assert.equal(verdict({ issue: false, expected: true }), 'Missed');
  assert.equal(verdict({ issue: true, expected: false }), 'Unexpected flag');
  assert.equal(verdict({ issue: false, expected: false, id: 'ellipsis' }), 'Intentional');
});

test('blind scoring deduplicates root causes and separates supported discoveries from unsupported claims', () => {
  const { grade } = require('../example/view-audit/grade-discovery.cjs');
  const record = {
    eligible: ['ink', 'contrast'],
    findings: [
      { id: 'A', status: 'confirmed', seed: 'ink', reason: 'Offset visible.' },
      { id: 'B', status: 'duplicate', seed: 'ink', reason: 'Same icon.' },
      { id: 'C', status: 'additional', reason: 'Previously unspecified issue.' },
      { id: 'D', status: 'unsupported', reason: 'Pixels do not support the claim.' },
      { id: 'E', status: 'indeterminate', reason: 'Requires another state.' }
    ]
  };
  const scores = grade(record);
  assert.equal(scores.recall, 0.5);
  assert.equal(scores.precision, 2 / 3);
  assert.deepEqual(scores.missed, ['contrast']);
  assert.equal(scores.duplicates, 1);
  assert.equal(scores.indeterminate, 1);
  assert.throws(
    () =>
      grade({
        ...record,
        findings: [...record.findings, { id: 'F', status: 'confirmed', seed: 'ink', reason: 'Same issue.' }]
      }),
    /duplicated/
  );
});

test('the blind packet contains clean images and acquisition metadata without measurement or oracle fields', async (t) => {
  const fs = require('node:fs/promises'),
    os = require('node:os'),
    path = require('node:path');
  const { createHash } = require('node:crypto');
  const { exportPacket } = require('../example/view-audit/blind-packet.cjs');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'fieldwork-packet-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const dir = path.join(temp, 'baseline'),
    out = path.join(temp, 'reviewer');
  await fs.mkdir(dir);
  const bytes = Buffer.from('synthetic capture, copied unaltered');
  await fs.writeFile(path.join(dir, 'a.png'), bytes);
  await fs.writeFile(
    path.join(dir, 'report.json'),
    JSON.stringify({
      plan: { profiles: { wide: { width: 100, height: 80, scale: 1 } } },
      rows: [{ secret: 'LOCATION_KEY' }],
      captures: {
        wide: { a: { file: 'a.png', arrival: 'Direct entry', anchors: { suspect: { box: { x: 3 } } } } }
      }
    })
  );
  await exportPacket(path.join(dir, 'report.json'), out);
  assert.deepEqual((await fs.readdir(out)).sort(), ['BRIEF.md', 'screens.json', 'wide']);
  const [entry] = JSON.parse(await fs.readFile(path.join(out, 'screens.json'), 'utf8'));
  assert.deepEqual(Object.keys(entry).sort(), [
    'arrival',
    'dpr',
    'height',
    'png',
    'profile',
    'sha256',
    'view',
    'width'
  ]);
  assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(await fs.readFile(path.join(out, entry.png)), bytes);
});
