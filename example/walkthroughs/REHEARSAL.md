# Workspace files walkthroughs

The README uses two repairs from the [single-screen audit](../AUDIT.md). The folder loop uses the first two compact captures. The list loop picks up at the second capture and ends at the third. All three source images are 780 × 720 pixels, captured at 390 × 360 CSS pixels and 2× density.

| Clip | Reference | Original | Retest |
| --- | --- | --- | --- |
| Folder | Halfway between the visible edges of the 28 px tab | Ink center 3 CSS px below the midpoint | 0 px |
| File list | Left edge shared by the first and last file markers | Middle marker 6 CSS px farther right | 0 px |

## Playback and review

Stageshow’s `close-up` example supplied the full-screen context and detail crop. At wide widths the capture and detail sit side by side. The compact composition stacks them and crops the screen around the subject. Each 10.8-second loop holds the original, draws the guide, shows the offset, and keeps the guide in place for the retest. Both measurements also appear in the [folder still](folder-comparison.png) and [list still](rows-comparison.png).

The Stageshow motion gate passed for each clip at browser widths of 744 and 390 px. A second reviewer spotted a missing tab boundary, a transition that split a file name, and a focus outline that touched the labels. The revised folder crop includes both tab edges and a height bracket. The revised list switches the entire row in place and leaves space between the outline and the text. The reviewer checked all three changes in the exported frames.

## Regenerate the README media

The GIFs and PNGs in this folder are ready to view in any clone. To change them, use a working copy of Stageshow with its dependencies installed, plus the [local capture tools](../../README.md#local-capture-tools). Set `STAGESHOW_DIR` to the absolute path of that working copy. From the Eagle Eye repo root, copy the scene and its three original captures, then start the Stageshow preview.

```sh
mkdir -p "$STAGESHOW_DIR/examples/eagle-eye" "$STAGESHOW_DIR/playground/public/eagle-evidence"
cp example/walkthroughs/index.tsx "$STAGESHOW_DIR/examples/eagle-eye/"
cp example/evidence/p01-compact.png example/evidence/p02-compact.png example/evidence/p03-compact.png "$STAGESHOW_DIR/playground/public/eagle-evidence/"
(cd "$STAGESHOW_DIR" && ./node_modules/.bin/vite playground --config playground/vite.config.ts --host 127.0.0.1 --port 4350 --strictPort)
```

In a second terminal, run the exporter from the Eagle Eye repo root with the Python environment active. It captures the wide and compact scenes in Chromium and replaces the four GIFs and two comparison PNGs in this folder.

```sh
node example/walkthroughs/render.cjs 'http://127.0.0.1:4350/?capture=eagle-eye'
```

To rehearse an edited scene, use the Stageshow film tool once for each subject (`folder` and `rows`) at each width (`744` and `390`). For example, this checks the compact folder loop.

```sh
node "$STAGESHOW_DIR/scripts/film.mjs" 'http://127.0.0.1:4350/?capture=eagle-eye&subject=folder' --select .ss-stage --width 390 --count 9 --every 1500 --out /tmp/eagle-folder-sheet.png --gate
```
