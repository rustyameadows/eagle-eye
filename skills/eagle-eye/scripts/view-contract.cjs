// The contract expresses design intent before any view is measured.
const AXES = { left: 'x', right: 'x', centerX: 'x', top: 'y', bottom: 'y', centerY: 'y' };
const has = (object, key) => Object.hasOwn(object, key);

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
function fields(object, allowed, name) {
  expect(object && typeof object === 'object' && !Array.isArray(object), 'Expected object: ' + name);
  for (const key of Object.keys(object)) expect(allowed.includes(key), 'Unknown field ' + name + '.' + key);
}
function entries(object, name) {
  expect(object && typeof object === 'object' && !Array.isArray(object), 'Expected named entries: ' + name);
  const items = Object.entries(object);
  expect(items.length, 'Empty ' + name);
  for (const [id] of items)
    expect(/^[a-z][a-z0-9-]*$/.test(id) && id !== 'constructor', 'Invalid ' + name + ' ID: ' + id);
  return items;
}
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

function validate(plan) {
  fields(plan, ['title', 'profiles', 'views', 'anchors', 'checks', 'pairs'], 'plan');
  expect(nonempty(plan.title), 'Supply a title');
  for (const [id, p] of entries(plan.profiles, 'profiles')) {
    fields(p, ['width', 'height', 'scale', 'theme'], id);
    expect(
      [p.width, p.height].every((n) => Number.isSafeInteger(n) && n > 0),
      'Invalid viewport ' + id
    );
    expect(Number.isFinite(p.scale) && p.scale > 0, 'Invalid device scale ' + id);
    expect(['light', 'dark'].includes(p.theme ?? 'light'), 'Invalid theme ' + id);
  }
  for (const [id, selector] of entries(plan.anchors, 'anchors'))
    expect(nonempty(selector), 'Empty selector ' + id);
  for (const [id, view] of entries(plan.views, 'views')) {
    fields(view, ['url', 'ready', 'selectors', 'arriveVia'], id);
    expect(nonempty(view.url), 'Missing URL ' + id);
    if (has(view, 'ready')) expect(nonempty(view.ready), 'Empty ready selector ' + id);
    if (has(view, 'arriveVia')) {
      fields(view.arriveVia, ['url', 'link', 'ready'], id + '.arriveVia');
      expect(
        nonempty(view.arriveVia.url) && nonempty(view.arriveVia.link),
        'Navigation requires a start URL and link selector for ' + id
      );
      if (has(view.arriveVia, 'ready'))
        expect(nonempty(view.arriveVia.ready), 'Empty starting ready selector ' + id);
    }
    if (has(view, 'selectors')) {
      fields(view.selectors, Object.keys(plan.anchors), id + '.selectors');
      for (const selector of Object.values(view.selectors))
        expect(nonempty(selector), 'Empty selector override ' + id);
    }
  }
  for (const [id, rule] of entries(plan.checks, 'checks')) {
    fields(rule, ['label', 'point', 'relativeTo', 'tolerance'], id);
    expect(nonempty(rule.label), 'Missing label ' + id);
    for (const key of ['point', ...(has(rule, 'relativeTo') ? ['relativeTo'] : [])]) {
      const point = rule[key];
      expect(
        Array.isArray(point) && point.length === 2 && has(plan.anchors, point[0]) && has(AXES, point[1]),
        'Invalid anchor or edge in ' + id
      );
    }
    expect(!rule.relativeTo || AXES[rule.point[1]] === AXES[rule.relativeTo[1]], 'Mixed axes in ' + id);
    expect(Number.isFinite(rule.tolerance) && rule.tolerance >= 0, 'Invalid tolerance ' + id);
  }
  expect(Array.isArray(plan.pairs) && plan.pairs.length, 'Supply at least one pair');
  const used = new Set();
  for (const pair of plan.pairs) {
    fields(pair, ['from', 'to', 'checks', 'expect', 'profiles'], 'pair');
    expect(
      has(plan.views, pair.from) && has(plan.views, pair.to) && pair.from !== pair.to,
      'Invalid view pair'
    );
    expect(
      Array.isArray(pair.checks) && pair.checks.length && pair.checks.every((id) => has(plan.checks, id)),
      'Unknown or missing check in pair'
    );
    const profiles = pair.profiles ?? Object.keys(plan.profiles);
    expect(
      Array.isArray(profiles) && profiles.length && profiles.every((id) => has(plan.profiles, id)),
      'Invalid pair profiles'
    );
    for (const profile of profiles)
      for (const check of pair.checks) {
        const key = [profile, pair.from, pair.to, check].join('/');
        expect(!used.has(key), 'Duplicate comparison ' + key);
        used.add(key);
      }
    if (has(pair, 'expect')) {
      fields(pair.expect, pair.checks, 'pair.expect');
      for (const [id, item] of Object.entries(pair.expect)) {
        fields(item, ['delta', 'reason'], 'expect.' + id);
        expect(
          Number.isFinite(item.delta) && nonempty(item.reason),
          'Expected change needs a delta and reason for ' + id
        );
      }
    }
  }
}

function coordinate(box, edge) {
  if (edge === 'centerX') return (box.left + box.right) / 2;
  if (edge === 'centerY') return (box.top + box.bottom) / 2;
  return box[edge];
}

function measure(capture, rule) {
  if (capture.issue) return { issue: capture.issue };
  const positions = [];
  for (const [id, edge] of [rule.point, ...(rule.relativeTo ? [rule.relativeTo] : [])]) {
    const anchor = capture.anchors[id];
    if (!anchor?.box) return { issue: id + ' — ' + (anchor?.issue || 'unmeasured') };
    positions.push(coordinate(anchor.box, edge));
  }
  return { value: positions[0] - (positions[1] ?? 0), positions };
}

function compare(plan, profile, captures) {
  const rows = [];
  for (const pair of plan.pairs) {
    if (pair.profiles && !pair.profiles.includes(profile)) continue;
    for (const check of pair.checks) {
      const rule = plan.checks[check];
      const a = measure(captures[pair.from], rule);
      const b = measure(captures[pair.to], rule);
      const expected = pair.expect?.[check]?.delta ?? 0;
      const delta = a.issue || b.issue ? null : b.value - a.value;
      let status = 'unverified';
      if (delta !== null) {
        status =
          Math.abs(delta - expected) > rule.tolerance ? 'drift' : expected === 0 ? 'aligned' : 'expected';
      }
      rows.push({
        profile,
        from: pair.from,
        to: pair.to,
        check,
        a,
        b,
        expected,
        delta,
        tolerance: rule.tolerance,
        status,
        reason: pair.expect?.[check]?.reason ?? ''
      });
    }
  }
  return rows;
}
module.exports = { AXES, validate, compare };
