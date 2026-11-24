// Export review inputs separately from measurements, fixture source and expected results.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function exportPacket(reportPath, output) {
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const root = path.dirname(path.resolve(reportPath));
  await fs.mkdir(output);
  const entries = [];
  for (const [profile, captures] of Object.entries(report.captures)) {
    const settings = report.plan.profiles[profile];
    await fs.mkdir(path.join(output, profile));
    for (const [view, capture] of Object.entries(captures)) {
      if (!capture.file) throw new Error('Unavailable capture for ' + profile + '/' + view);
      const relative = profile + '/' + view + '.png';
      await fs.copyFile(path.join(root, capture.file), path.join(output, relative));
      entries.push({
        view,
        profile,
        width: settings.width,
        height: settings.height,
        dpr: settings.scale,
        sha256: createHash('sha256')
          .update(await fs.readFile(path.join(output, relative)))
          .digest('hex'),
        arrival: capture.arrival,
        png: relative
      });
    }
  }
  const states = path.resolve(root, '../visual-review');
  const focusSpec = report.plan.profiles.wide;
  if (focusSpec) {
    for (const [name, suffix] of [
      ['member-before', 'member-before'],
      ['member-keyboard', 'member-keyboard']
    ]) {
      const source = path.join(states, path.basename(root) + '-' + suffix + '.png');
      try {
        await fs.access(source);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const png = 'wide/' + name + '.png';
      await fs.copyFile(source, path.join(output, png));
      entries.push({
        view: name,
        profile: 'wide',
        width: focusSpec.width,
        height: focusSpec.height,
        dpr: focusSpec.scale,
        sha256: createHash('sha256')
          .update(await fs.readFile(path.join(output, png)))
          .digest('hex'),
        arrival:
          name === 'member-keyboard'
            ? 'Keyboard Tab reached the member action link'
            : 'Before keyboard focus',
        png
      });
    }
  }
  await fs.writeFile(path.join(output, 'screens.json'), JSON.stringify(entries, null, 2) + '\n');
  await fs.writeFile(
    path.join(output, 'BRIEF.md'),
    [
      '# Fieldwork screenshot review',
      '',
      'Review the supplied field-research journal screens with Eagle Eye. The product team wants to know which inconsistencies affect reading, navigation and confidence. Reports should be useful to a designer who must decide what to fix.',
      '',
      'Inventory the supplied views and profiles. Compare both the overall layout and comparable roles within a component. Use the original PNGs for measurements and keep annotated derivatives separately. Group correlated symptoms. Report limitations when a static screenshot cannot establish an interaction or the design intent.',
      '',
      'For each finding, give a stable ID, the affected views and profiles, the visible symptom, evidence paths and an expected relationship or retest. Give any legitimate layout differences their own notes. Include a coverage table and call out unresolved questions. A supported finding can be qualitative.',
      '',
      'Use only this packet and the skill. The screen index gives CSS viewport sizes, image densities and arrival paths. Save your findings before opening any evaluation keys or results.',
      ''
    ].join('\n')
  );
  console.log('Blind packet: ' + entries.length + ' clean screenshots in ' + output);
}
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node blind-packet.cjs REPORT.json NEW-DIRECTORY');
    process.exitCode = 1;
  } else
    exportPacket(input, output).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
module.exports = { exportPacket };
