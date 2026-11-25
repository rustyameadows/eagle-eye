# Workspace files · example audit

This local fixture preserves four revisions of a small file list. The baseline, tab correction, row inset correction and final correction are selected with the `pass` URL parameter. The purpose of the fixture is to make the audit reproducible.

**Scope** — Refine this single screen at 720 × 360 (1×) and 390 × 360 (2×) CSS px in Chromium 158, light theme, reduced motion. Check the toolbar and list in the default state.

**Reference** — The 28 px tab establishes its icon centerline. The first and last list markers establish the shared leading rail. The deliberately regular marker and icon shapes support exact raster measurements.

## Coverage

| Surface | Wide | Compact |
| --- | --- | --- |
| Screen, tab and three list rows | Inspected at 1×. [Baseline](evidence/p01-wide.png) · [Final](evidence/p04-wide.png) | Inspected at 2×. [Baseline](evidence/p01-compact.png) · [Final](evidence/p04-compact.png) |

## Findings and cycles

| ID | Observation and impact | Acceptance | Status |
| --- | --- | --- | --- |
| E01 · polish | The folder sits 3 CSS px below the tab midpoint, making the icon sag beneath the label. | Center the drawn icon at y=109 in the compact capture. | Verified at compact 2× in cycle 2 |
| E02 · consistency | The second marker starts at x=35 while its siblings start at x=29. An unintended indent suggests the file belongs to a different level. | Restore the shared marker edge and recheck all three siblings. | Verified at compact 2× in cycle 3 |
| E03 · polish | The last date sits 1 CSS px below the repeated 40 px row rhythm at compact 2×. | Preserve divider space and match the two preceding increments. | Verified in cycle 4 |
| E04 · accepted | The numeral 3 has an ink center 1 CSS px above its pill center. The glyph still reads centered at normal size. | Retain the typeface alignment for this single-digit sample. Reopen if a representative set of counts looks consistently displaced. | Accepted optical difference |

1. **Baseline.** The [guided crop](evidence/p01-guided.png) shows both discrepancies. The first and last markers already share a leading edge. Next, check the wide layout and retest the icon correction on compact.

2. **Correct the folder.** Remove its vertical translation. The [cycle 2 crop](evidence/p02-guided.png) measures 0 CSS px on the midpoint; the list indent still measures +6 CSS px. The [wide baseline](evidence/p01-wide.png) shows the list rail already aligned there. Next, restore the compact inset and recheck both viewports. [Clean capture](evidence/p02-compact.png)

3. **Restore the shared inset.** The compact row uses the same inset as its siblings. The [cycle 3 crop](evidence/p03-guided.png) measures 0 CSS px of offset for all three markers and the folder icon. Checked the complete [compact](evidence/p03-compact.png) and [wide](evidence/p03-wide.png) views again. The date column kept its trailing edge. A second review then checked vertical rhythm within it.

4. **Investigate the final date.** A second reviewer noticed that the middle-to-last date advanced 41 CSS px while the row pitch is 40 CSS px. The three sets of date ink in the compact capture span y=153.5–162, 193.5–202 and 234.5–243 CSS px. The last row drops the divider border, which changes the content area available for centering. A transparent border preserves the divider's space. The [before](evidence/p03-dates.png) and [after](evidence/p04-dates.png) guides show the final date offset returning to zero. Rechecked the [folder and marker rails](evidence/p04-guided.png), then rescanned the clean views at both widths. The 1 px optical difference in the numeral remains recorded above.

## Result

| Compact measurement | Baseline | After icon correction | After row correction | Final |
| --- | ---: | ---: | ---: | ---: |
| Folder center relative to tab center | +3 CSS px | 0 | 0 | 0 |
| Middle marker relative to shared leading edge | +6 CSS px | +6 CSS px | 0 | 0 |
| Last date relative to row rhythm | +1 CSS px | Unmeasured | +1 CSS px | 0 |

Three corrections verified in their affected states. One optical difference accepted. Positive values mean down for the folder and right for the marker. The example covers a static file list at two viewport widths. Interaction flows and live application data are outside this fixture.

## Reproduce the screenshots

From the repo root, set up the [local capture tools](../README.md#local-capture-tools), then run this in a POSIX shell. The screenshots and guides are saved in a fresh temporary directory.

```sh
run_dir=$(mktemp -d)
skill_dir="$PWD/skills/eagle-eye"
fixture=$(python3 -c 'from pathlib import Path; print(Path("example/screen.html").resolve().as_uri())')
(
set -e
for pass in baseline tab row final; do
  node "$skill_dir/scripts/capture.cjs" "$fixture?pass=$pass" "$run_dir/$pass.png" --width 390 --height 360 --scale 2
  python3 "$skill_dir/scripts/guides.py" "$run_dir/$pass.png" example/compact-guides.json "$run_dir/$pass-guided.png"
done
python3 "$skill_dir/scripts/guides.py" "$run_dir/row.png" example/date-guides.json "$run_dir/dates-before.png"
python3 "$skill_dir/scripts/guides.py" "$run_dir/final.png" example/date-guides.json "$run_dir/dates-after.png"
)
```
