const { test } = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../example/view-audit/plan.json');
const { validate, compare } = require('../skills/eagle-eye/scripts/view-contract.cjs');

test('the demo declares unambiguous, same-axis comparisons', () => validate(plan));
for (const [label, change, pattern] of [
  ['mixed axes', (p) => (p.checks['title-inset'].relativeTo[1] = 'top'), /Mixed axes/],
  ['negative tolerance', (p) => (p.checks['title-inset'].tolerance = -1), /tolerance/],
  ['missing expected-change rationale', (p) => (p.pairs[1].expect['title-top'].reason = ' '), /reason/],
  ['unknown view', (p) => (p.pairs[0].to = 'archvie'), /view pair/],
  ['overlapping comparisons', (p) => p.pairs.push(p.pairs[0]), /Duplicate comparison/],
  ['misspelled constraint', (p) => (p.checks['title-inset'].tolerence = 5), /Unknown field/],
  ['unknown profile', (p) => (p.pairs[0].profiles = ['small']), /profiles/],
  ['invalid edge', (p) => (p.checks['pane-left'].point[1] = 'baseline'), /edge/]
]) {
  test('rejects ' + label, () => {
    const copy = structuredClone(plan);
    change(copy);
    assert.throws(() => validate(copy), pattern);
  });
}

test('parent movement cancels in local spacing; exact tolerance passes in either direction', () => {
  const pair = { from: 'a', to: 'b', checks: ['inset', 'absolute', 'center'] };
  const p = {
    checks: {
      inset: { point: ['title', 'left'], relativeTo: ['pane', 'left'], tolerance: 0.5 },
      absolute: { point: ['title', 'left'], tolerance: 0 },
      center: { point: ['title', 'centerY'], tolerance: 0.25 }
    },
    pairs: [pair, { ...pair, from: 'b', to: 'a' }]
  };
  const box = (left, top = 0) => ({ box: { left, top, right: left + 50, bottom: top + 10 } });
  const captures = {
    a: { anchors: { title: box(12), pane: box(0) } },
    b: { anchors: { title: box(16.5, 0.5), pane: box(4) } }
  };
  const rows = compare(p, 'wide', captures);
  assert.deepEqual(
    rows.map((r) => [r.status, r.delta]),
    [
      ['aligned', 0.5],
      ['drift', 4.5],
      ['drift', 0.5],
      ['aligned', -0.5],
      ['drift', -4.5],
      ['drift', -0.5]
    ]
  );
});
test('an intended shift is still checked against its declared magnitude', () => {
  const p = {
    checks: { edge: { point: ['x', 'bottom'], tolerance: 0.25 } },
    pairs: [{ from: 'a', to: 'b', checks: ['edge'], expect: { edge: { delta: 32, reason: 'Breadcrumb' } } }]
  };
  const caps = {
    a: { anchors: { x: { box: { bottom: 10 } } } },
    b: { anchors: { x: { box: { bottom: 41 } } } }
  };
  assert.equal(compare(p, 'wide', caps)[0].status, 'drift');
  caps.b.anchors.x.box.bottom = 42;
  assert.equal(compare(p, 'wide', caps)[0].status, 'expected');
});
