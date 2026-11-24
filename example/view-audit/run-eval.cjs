// Use one new folder for attributable evidence. Completed red evals also get a handoff.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const repo = path.resolve(__dirname, '../..');
const output = process.argv[2] && path.resolve(process.argv[2]);
const failures = [];

function run(program, args, env = {}) {
  const result = spawnSync(program, args, { cwd: repo, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    failures.push(path.basename(args[0]) + ' exited with ' + (result.status ?? result.signal));
}
function main() {
  if (!output || process.argv.length !== 3)
    throw new Error('Usage: node example/view-audit/run-eval.cjs NEW-OUTPUT-DIRECTORY');
  if (fs.existsSync(output)) throw new Error('Choose a new directory to preserve existing evidence.');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  run(process.execPath, ['tests/view-contract.test.cjs']);
  run(process.execPath, ['tests/visual-review.test.cjs']);
  run('python3', ['tests/handoff.test.py']);
  run(process.execPath, ['tests/view-browser.test.cjs'], { EAGLE_EYE_TEST_OUT: output });
  if (
    !['baseline', 'rails', 'fixed'].every((stage) => fs.existsSync(path.join(output, stage, 'report.json')))
  )
    throw new Error(
      'Incomplete browser capture. Inspect the test output and partial artifacts in ' + output
    );
  if (!fs.existsSync(path.join(output, 'score.json')))
    run(process.execPath, ['example/view-audit/score.cjs', output, path.join(output, 'score.json')]);
  run(process.execPath, ['example/view-audit/visual-review.cjs', output]);
  run(process.execPath, ['example/view-audit/build-atlas.cjs', output]);
  run(process.execPath, [
    'example/view-audit/blind-packet.cjs',
    path.join(output, 'baseline', 'report.json'),
    path.join(output, 'blind')
  ]);
  run('python3', [
    'skills/eagle-eye/scripts/render-handoff.py',
    'example/view-audit/handoff.json',
    path.join(output, 'handoff.html'),
    '--runs',
    output
  ]);
  if (fs.existsSync(path.join(output, 'handoff.html')))
    console.log('Open ' + path.join(output, 'handoff.html'));
  if (failures.length) throw new Error(failures.join('\n'));
}
try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
