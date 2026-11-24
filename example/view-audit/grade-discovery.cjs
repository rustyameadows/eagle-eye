// Compute discovery metrics after an independent grader has adjudicated the frozen submission.
const fs = require('node:fs/promises');
const path = require('node:path');
const oracle = require('./oracle.json');
const { cases } = require('./visual-review.cjs');

const labels = new Map([
  ...oracle.seeds.map((seed) => [seed.id, seed.label]),
  ...cases.filter((item) => !item.control).map((item) => [item.id, item.title])
]);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
function grade(record) {
  const allowedVerdicts = ['confirmed', 'additional', 'unsupported', 'duplicate', 'indeterminate'];
  const eligible = new Set(record.eligible);
  if (
    !eligible.size ||
    eligible.size !== record.eligible.length ||
    [...eligible].some((id) => !labels.has(id))
  )
    throw new Error('Eligible causes must be an explicit list of unique, known case IDs.');
  const seen = new Set(),
    matched = new Set();
  for (const item of record.findings) {
    if (!item.id || seen.has(item.id) || !allowedVerdicts.includes(item.status) || !item.reason)
      throw new Error('Invalid or duplicate adjudication for ' + item.id);
    seen.add(item.id);
    if (item.status === 'confirmed') {
      if (!eligible.has(item.seed) || matched.has(item.seed))
        throw new Error('Confirmed seed duplicated or outside scope: ' + item.seed);
      matched.add(item.seed);
    } else if (item.seed && item.status !== 'duplicate')
      throw new Error('Only confirmed or duplicate observations identify a seed.');
  }
  const count = (status) => record.findings.filter((f) => f.status === status).length;
  const supported = matched.size + count('additional'),
    disputed = count('unsupported');
  return {
    eligible: eligible.size,
    detected: matched.size,
    recall: matched.size / eligible.size,
    additional: count('additional'),
    unsupported: disputed,
    duplicates: count('duplicate'),
    indeterminate: count('indeterminate'),
    precision: supported + disputed ? supported / (supported + disputed) : null,
    missed: [...eligible].filter((id) => !matched.has(id))
  };
}
function html(record, score) {
  const percent = (v) => (v === null ? '—' : Math.round(v * 1000) / 10 + '%');
  const statuses = {
    confirmed: 'Matched seed',
    additional: 'Additional issue',
    unsupported: 'Unsupported',
    duplicate: 'Duplicate',
    indeterminate: 'Indeterminate'
  };
  const rows = record.findings
    .map(
      (item) =>
        '<tr><td>' +
        escape(item.id) +
        '</td><td>' +
        escape(item.title) +
        '</td><td>' +
        escape(statuses[item.status]) +
        '</td><td>' +
        escape(item.reason) +
        '</td></tr>'
    )
    .join('');
  return (
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Blind discovery pilot · Fieldwork</title><style>' +
    ':root{font-family:system-ui,sans-serif;color:#202f2b;background:#f4f5ef}body{max-width:1000px;padding:clamp(16px,5vw,60px);margin:auto}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:clamp(34px,5vw,52px);margin:10px 0}h2{margin-top:30px}.stats{display:flex;gap:30px;flex-wrap:wrap;border-block:1px solid #bccbbb;padding:17px 0}.stats b{display:block;font-size:24px}p,li,td{line-height:1.55}.table{overflow-x:auto}table{border-collapse:collapse;min-width:590px}th,td{text-align:left;vertical-align:top;padding:9px 8px;border-bottom:1px solid #cbd4c8}a{color:#225b42}.meta{color:#4f6459}</style>' +
    '<p class="meta">Eagle Eye / Fieldwork eval</p><h1>Blind discovery pilot</h1><p>' +
    escape(record.conditions) +
    '</p><div class="stats"><span><b>' +
    score.detected +
    ' / ' +
    score.eligible +
    '</b>Seeded causes found</span><span><b>' +
    percent(score.recall) +
    '</b>Seed recall</span><span><b>' +
    percent(score.precision) +
    '</b>Supported precision</span></div>' +
    '<h2>What the reviewer covered</h2><p>' +
    escape(record.coverage) +
    '</p><p>' +
    escape(record.limit) +
    '</p><p><a href="AUDIT.md">Frozen reviewer submission</a> · <a href="grade.json">Grader decisions</a></p>' +
    '<h2>Findings</h2><div class="table"><table><thead><tr><th>ID</th><th>Observation</th><th>Disposition</th><th>Grading rationale</th></tr></thead><tbody>' +
    rows +
    '</tbody></table></div>' +
    '<h2>Missed seeds</h2>' +
    (score.missed.length
      ? '<ul>' + score.missed.map((id) => '<li>' + escape(labels.get(id)) + '</li>').join('') + '</ul>'
      : '<p>Every eligible seed was matched.</p>') +
    '<p class="meta">Additional supported findings count toward precision. Duplicates and indeterminate findings are recorded separately. Recall uses the eligible seeded causes. This is one review of one fixed packet.</p></html>'
  );
}
async function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error('Usage: node grade-discovery.cjs REVIEW-DIRECTORY');
  const record = JSON.parse(await fs.readFile(path.join(folder, 'grade.json'), 'utf8'));
  await fs.access(path.join(folder, 'AUDIT.md'));
  const score = grade(record);
  await fs.writeFile(path.join(folder, 'index.html'), html(record, score));
  await fs.writeFile(path.join(folder, 'score.json'), JSON.stringify(score, null, 2) + '\n');
  console.log('Blind discovery: ' + score.detected + '/' + score.eligible + ' eligible seeds matched.');
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { grade };
