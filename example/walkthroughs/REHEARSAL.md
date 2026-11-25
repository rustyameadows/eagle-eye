# README walkthroughs

The folder and list walkthroughs use two repairs from the [single-screen audit](../AUDIT.md). The folder loop uses the first two compact captures. The list loop picks up at the second capture and ends at the third. All three source images are 780 × 720 pixels, captured at 390 × 360 CSS pixels and 2× density.

| Clip | Reference | Original | Retest |
| --- | --- | --- | --- |
| Folder | Halfway between the visible edges of the 28 px tab | Ink center 3 CSS px below the midpoint | 0 px |
| File list | Left edge shared by the first and last file markers | Middle marker 6 CSS px farther right | 0 px |

## From Library to Notes

The linked [Library](desk/index.html) and [Notes](desk/notes.html) are small static pages in the same workspace. Open the HTML locally and follow the navigation. The URL parameter `?pass=nav` selects the navigation repair. `?pass=type` keeps that repair and removes the margin on the headline’s initial P. Following a link preserves the current revision.

The comparison holds the viewport, scroll and 24 px main-content inset fixed. Its first pass measures the same book icon moving 3 CSS px right on Notes and 3 px left on the return to Library. Both journeys measure 0 px after restoring the shared navigation inset. The icon’s painted edge agrees with the captured layout box. [Captures](desk/evidence) · [Measurements](desk/measurements.json)

The Notes headline is set in 44 px DejaVu Serif. Compare the whole words at reading size. In the original, the P reads apart from “aper.” Its 4 px inline margin interrupts native shaping. Removing that margin reduces the clear space between the painted columns from 8 px to 2 px. At this size the a–p gap remains 2.5 px, p–e remains 4 px and e–r remains 3.5 px. All ten boundaries were indexed. The repaired line matches a fresh rendering with the entire title in one text node, pixel for pixel. The line still reads “Paper trail,” with the same accessible name and line count. The ink measurement explains this pair in this face and size.

To reproduce the evidence, run both inspectors from the repo root into fresh directories. The collector checks the matching captures and writes the four PNGs and their measurements into `desk/`.

```sh
node skills/eagle-eye/scripts/compare-views.cjs example/walkthroughs/desk/plan.json /tmp/desk-views-01
node skills/eagle-eye/scripts/inspect-headlines.cjs example/walkthroughs/desk/plan.json /tmp/desk-type-01 --selector 'main h1'
python3 example/walkthroughs/desk/collect.py /tmp/desk-views-01 /tmp/desk-type-01
```

## Rainbow case study

The [before-and-after package](rainbow/README.md) preserves four viewport captures of the real work-page headline. The wide loop uses the 1440 px capture at 1×. The compact loop uses the 390 px capture at 2×. Each shows the whole line at reading size, then measures the same two ink contours in the enlargement. The animation holds each capture at its original coordinates and masks ink belonging to neighboring words in the detail crop. The offline viewer retains every original pixel. Rebuild the downloadable archive with `python3 example/walkthroughs/rainbow/package.py`.

## Playback and review

Stageshow’s `close-up` example supplied the full-screen context and detail crop. At wide widths the capture and detail sit side by side. The compact composition stacks them and crops the screen around the subject. Each 10.8-second loop holds the original, draws the guide, shows the offset, and keeps the guide in place for the retest. Both measurements also appear in the [folder still](folder-comparison.png) and [list still](rows-comparison.png).

For the folder and list, the Stageshow motion gate passed for each clip at browser widths of 744 and 390 px. A second reviewer spotted a missing tab boundary, a transition that split a file name, and a focus outline that touched the labels. The revised folder crop includes both tab edges and a height bracket. The revised list switches the entire row in place and leaves space between the outline and the text. The reviewer checked all three changes in the exported frames.

For the other three loops, an independent reviewer checked the exported wide and compact GIFs. The first wide Rainbow crop caught parts of adjacent words. The first loop endings also flashed the earlier problem again. The revised Rainbow detail isolates “I’ve” inside a fixed frame. Each result now stays on screen until the loop returns directly to its opening capture. All six revised Stageshow runs reported complete loop coverage and no motion findings at the two tested widths. The measurements come from the stored lossless images.

## Regenerate the README media

The GIFs and PNGs in this folder are ready to view in any clone. To change them, use a working copy of Stageshow with its dependencies installed, plus the [local capture tools](../../README.md#local-capture-tools). Set `STAGESHOW_DIR` to the absolute path of that working copy. From the Eagle Eye repo root, copy the scene sources, recorded measurements and original captures, then start the Stageshow preview.

```sh
scene="$STAGESHOW_DIR/examples/eagle-eye"
assets="$STAGESHOW_DIR/playground/public/eagle-evidence"
mkdir -p "$scene/desk" "$scene/rainbow" "$assets/desk" "$assets/rainbow"
cp example/walkthroughs/index.tsx example/walkthroughs/proofs.tsx "$scene/"
cp example/walkthroughs/desk/measurements.json "$scene/desk/"
cp example/walkthroughs/rainbow/pair.json "$scene/rainbow/"
cp example/evidence/p01-compact.png example/evidence/p02-compact.png example/evidence/p03-compact.png "$assets/"
cp example/walkthroughs/desk/evidence/*.png "$assets/desk/"
cp -R example/walkthroughs/rainbow/pixels/rasters/desktop example/walkthroughs/rainbow/pixels/rasters/phone "$assets/rainbow/"
(cd "$STAGESHOW_DIR" && ./node_modules/.bin/vite playground --config playground/vite.config.ts --host 127.0.0.1 --port 4350 --strictPort)
```

In a second terminal, run the exporter from the Eagle Eye repo root with the Python environment active. It captures the wide and compact scenes in Chromium and replaces the GIFs and comparison PNGs in this folder.

```sh
node example/walkthroughs/render.cjs 'http://127.0.0.1:4350/?capture=eagle-eye'
```

To export a selection, append the subject names to the render command. To rehearse an edited scene, use the Stageshow film tool once for each subject (`folder`, `rows`, `navigation`, `kerning` and `rainbow`) at each width (`744` and `390`). For example, this checks the compact folder loop.

```sh
node "$STAGESHOW_DIR/scripts/film.mjs" 'http://127.0.0.1:4350/?capture=eagle-eye&subject=folder' --select .ss-stage --width 390 --count 9 --every 1500 --out /tmp/eagle-folder-sheet.png --gate
```
