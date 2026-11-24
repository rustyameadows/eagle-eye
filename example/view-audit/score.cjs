// Score measurements against the separately authored fixture specification.
// No browser, fixture CSS, embedded plan checks, or comparison-engine imports.
const fs = require('node:fs/promises');
const path = require('node:path');
const oracle = require('./oracle.json');

function targetsForStage(stage) {
  const targets = new Map();
  for (const profile of oracle.profiles) {
    for (const [pair, checks] of Object.entries(oracle.coverage)) {
      for (const check of checks) {
        const rule = pair + '/' + check;
        const intended = oracle.intended[rule] ?? 0;
        let delta = intended;
        for (const seed of oracle.seeds) {
          if (seed.profiles.includes(profile)) delta += (seed.signals[rule] ?? 0) * seed.offsets[stage];
        }
        const status = delta !== intended ? 'drift' : intended ? 'expected' : 'aligned';
        targets.set(profile + '/' + rule, { delta, intended, status });
      }
    }
  }
  return targets;
}

const divide = (n, d) => d ? n / d : null;
const same = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7;

function scoreStage(stage, report, priorStage) {
  if (!oracle.stages.includes(stage)) throw new Error('Unknown stage ' + stage);
  const targets = targetsForStage(stage);
  const actual = new Map();
  const errors = [];
  const metrics = {
    rows: report.rows.length, targetRows: targets.size, captures: 0, physicalPages: 0, profiles: 0,
    truePositives: 0, falseNegatives: 0, falsePositives: 0, trueNegatives: 0,
    unverified: 0, missing: 0, extra: 0, wrongDelta: 0, wrongStatus: 0,
    regressions: 0, failedRepairs: 0, expectedChanges: 0, verifiedExpectedChanges: 0,
    activeSeeds: 0, detectedSeeds: 0, repairedSeeds: 0, verifiedRepairedSeeds: 0, remainsFixed: 0
  };
  const problems = new Map();
  function issue(key, kind, details = {}) {
    if (!problems.has(key)) problems.set(key, new Set());
    problems.get(key).add(kind);
    errors.push({ key, kind, ...details });
  }

  // Require a usable capture for each declared arrival in every profile.
  const views = new Set(Object.keys(oracle.coverage).flatMap((pair) => pair.split('/')));
  const pages = new Set();
  metrics.profiles = Object.keys(report.captures).length;
  for (const profile of oracle.profiles) {
    for (const view of views) {
      const capture = report.captures[profile]?.[view];
      const route = report.plan.views[view]?.url;
      if (!capture?.file || capture.issue || !route) {
        issue(profile + '/' + view, 'missing-capture');
      } else {
        metrics.captures++;
        pages.add(new URL(route, 'file:///').pathname);
      }
    }
  }
  metrics.physicalPages = pages.size;
  if (pages.size !== oracle.physicalPages) issue('coverage', 'physical-pages', { actual: pages.size });
  for (const [profile, captures] of Object.entries(report.captures)) {
    for (const view of Object.keys(captures)) {
      if (!oracle.profiles.includes(profile) || !views.has(view)) issue(profile + '/' + view, 'extra-capture');
    }
  }

  for (const row of report.rows) {
    const key = [row.profile, row.from, row.to, row.check].join('/');
    if (row.status === 'unverified') metrics.unverified++;
    if (!targets.has(key) || actual.has(key)) {
      metrics.extra++;
      if (row.status === 'drift') metrics.falsePositives++;
      issue(key, actual.has(key) ? 'duplicate-row' : 'extra-row');
      continue;
    }
    actual.set(key, row);
  }

  for (const [key, target] of targets) {
    const row = actual.get(key);
    const positive = target.status === 'drift';
    if (target.intended) metrics.expectedChanges++;
    if (!row) {
      metrics.missing++;
      if (positive) metrics.falseNegatives++;
      issue(key, 'missing-row', { target });
      continue;
    }
    if (row.status === 'drift') {
      if (positive) metrics.truePositives++;
      else metrics.falsePositives++;
    } else if (positive) {
      metrics.falseNegatives++;
    } else if (row.status === 'aligned' || row.status === 'expected') {
      metrics.trueNegatives++;
    }
    if (row.status !== target.status) {
      metrics.wrongStatus++;
      issue(key, row.status === 'unverified' ? 'unverified' : 'wrong-status', {
        expectedStatus: target.status, actualStatus: row.status
      });
    }
    if (row.status !== 'unverified') {
      if (!same(row.delta, target.delta)) {
        metrics.wrongDelta++;
        issue(key, 'wrong-delta', { expectedDelta: target.delta, actualDelta: row.delta });
      }
      if (!same(row.b?.value - row.a?.value, row.delta)) issue(key, 'inconsistent-measurements');
    }
    if (row.expected !== target.intended) issue(key, 'wrong-design-intent');
    if (target.intended && !problems.has(key)) metrics.verifiedExpectedChanges++;
  }

  const seeds = oracle.seeds.map((seed) => {
    const active = seed.offsets[stage] !== 0;
    // Without a prior report the single-stage API can establish the current repair only.
    // A confirmed regression/continued repair requires observations from the preceding stage.
    const prior = priorStage?.seeds.find((item) => item.id === seed.id);
    const priorHealthy = (profile) => {
      const obs = prior?.observations.find((item) => item.profile === profile);
      return obs?.outcome === 'remains-fixed' || obs?.outcome === 'verified-repair';
    };
    const good = active ? 'detected' : 'verified-repair';
    // Score every affected width, including zero after repair. Other widths are independently scored controls.
    const observations = seed.profiles.map((profile) => {
      const key = profile + '/' + seed.witness;
      const row = actual.get(key);
      const targetDelta = targets.get(key).delta;
      let outcome = !active && priorHealthy(profile) ? 'remains-fixed' : good;
      if (!row) outcome = 'missing';
      else if (row.status === 'unverified') outcome = 'unverified';
      else if (!active && row.status === 'drift') outcome = priorHealthy(profile) ? 'regression' : 'failed-repair';
      else if (active && row.status !== 'drift') outcome = 'missed';
      else if (problems.has(key)) outcome = 'incorrect-measurement';
      return { profile, targetDelta, actualDelta: row?.delta ?? null, status: row?.status ?? 'missing', outcome };
    });
    const failed = observations.filter((obs) => obs.outcome !== good && obs.outcome !== 'remains-fixed');
    const healthy = observations.every((obs) => obs.outcome === 'remains-fixed') ? 'remains-fixed' : good;
    const outcome = failed.find((obs) => obs.outcome === 'regression')?.outcome ?? failed[0]?.outcome ?? healthy;
    if (active) {
      metrics.activeSeeds++;
      if (!failed.length) metrics.detectedSeeds++;
    } else {
      metrics.repairedSeeds++;
      if (!failed.length) metrics.verifiedRepairedSeeds++;
      if (outcome === 'remains-fixed') metrics.remainsFixed++;
      if (outcome === 'regression') metrics.regressions++;
      if (outcome === 'failed-repair') metrics.failedRepairs++;
    }
    return { id: seed.id, label: seed.label, witness: seed.witness, active, outcome, observations };
  });
  metrics.precision = divide(metrics.truePositives, metrics.truePositives + metrics.falsePositives);
  metrics.recall = divide(metrics.truePositives, metrics.truePositives + metrics.falseNegatives);
  return { passed: !errors.length, metrics, seeds, errors };
}

async function scoreRun(directory) {
  const stages = {};
  let previous;
  for (const stage of oracle.stages) {
    const reportPath = path.join(directory, stage, 'report.json');
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    stages[stage] = scoreStage(stage, report, previous);
    previous = stages[stage];
  }
  return { version: 1, passed: Object.values(stages).every((s) => s.passed), stages };
}

if (require.main === module) {
  (async () => {
    const [directory, output, ...extra] = process.argv.slice(2);
    if (!directory || extra.length) throw new Error('Usage: node score.cjs RUN-DIRECTORY [OUTPUT.json]');
    const score = await scoreRun(directory);
    const json = JSON.stringify(score, null, 2) + '\n';
    if (output) await fs.writeFile(output, json);
    else process.stdout.write(json);
    if (!score.passed) process.exitCode = 2;
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { scoreStage, scoreRun };
