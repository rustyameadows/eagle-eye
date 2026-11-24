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

const oracle = require('../example/view-audit/oracle.json');
test('the frozen answer key accounts for every comparison and seed witness', () => {
  assert.deepEqual(Object.keys(plan.profiles), oracle.profiles);
  const pairs = Object.fromEntries(plan.pairs.map(({from, to, checks}) => [from + '/' + to, checks]));
  assert.deepEqual(pairs, oracle.coverage);
  const keys = new Set(Object.entries(oracle.coverage).flatMap(([pair, checks]) => checks.map((id) => pair + '/' + id)));
  assert.equal(new Set(oracle.seeds.map((s) => s.id)).size, 16);
  for (const [rule, delta] of Object.entries(oracle.intended)) {
    assert(keys.has(rule) && Number.isFinite(delta) && delta !== 0, rule);
  }
  for (const s of oracle.seeds) {
    assert.equal(s.signals[s.witness], 1, s.id);
    assert(s.profiles.length && s.profiles.every((profile) => oracle.profiles.includes(profile)));
    assert(Object.keys(s.signals).every((key) => keys.has(key)), s.id);
    assert.deepEqual(Object.keys(s.offsets), oracle.stages);
    assert.notEqual(s.offsets.baseline, 0);
    assert.equal(s.offsets.fixed, 0);
  }
});
test('matrix covers each physical page, arrival, section component, and orthogonal control', () => {
  const pages = new Set(Object.values(plan.views).map((view) => view.url.split('#')[0]));
  assert.equal(pages.size, 24);
  assert.equal(Object.values(plan.views).filter((v) => v.arriveVia).length, 11);
  const linked = plan.pairs.filter((pair) => pair.checks.some((key) => key.endsWith('-control')));
  assert.equal(linked.length, 10);
  for (const { from, to, checks } of linked) {
    assert.equal(plan.views[to].arriveVia.url, plan.views[from].url);
    const [metric, control] = checks.map((id) => plan.checks[id]);
    assert.deepEqual([metric.point[0], metric.relativeTo[0]], [control.point[0], control.relativeTo[0]]);
    const horizontal = (edge) => ['left','right','centerX'].includes(edge);
    assert.notEqual(horizontal(metric.point[1]), horizontal(control.point[1]));
  }
});
