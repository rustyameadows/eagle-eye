# Capture and measurement

## Clean evidence

Use the target project's browser harness or an interactive browser for signed-in flows, overlays, scroll positions or keyboard states. Record route, state, data, browser, viewport in CSS pixels, device pixel ratio (DPR), theme, zoom, animation setting and revision alongside the capture. Wait for the intended content, images and fonts to settle. For a motion issue, reproduce with the relevant motion setting and inspect frames around the transition. Use browser-emulated DPR when appropriate and label it as emulated.

The optional helper captures an initial URL state in Chromium, with reduced motion and animations disabled. The helper looks for Playwright in the current project and then the skill checkout. Use Node 18.3+ and a matching Chromium installation, or set EAGLE_EYE_PLAYWRIGHT to an absolute installed playwright or playwright-core module with compatible Chromium. Set SKILL to the absolute skill directory in your shell.

```sh
node "$SKILL/scripts/capture.cjs" http://localhost:3000/settings evidence/p01-wide.png --width 1440 --height 900 --scale 1 --ready 'main'
```

Use an application-specific ready selector when a generic shell appears before content. Add `--full-page` for a page overview, `--theme dark` for dark mode, or `--scale 2` for a second native-density render. Use different names for each cycle. Save the printed metadata in the report when it matters. A supplied screenshot with unknown scale can use `"scale": 1, "units": "image-px"` in its recipe. Both legend and measurements will then use image pixels.

## Build guides from a claim

Pick a stable anchor that explains intent. For example, the midpoint of a 28 CSS px tab whose top is at y=64 is y=78. Choose the guide using the layout bounds or design spec, then independently measure the subject. A guide derived from the drifting subject will always appear to pass. Use a text baseline only when typography supplies the baseline; the bottom of an ink rectangle varies by letters.

The helper uses Python 3 and Pillow. All recipe coordinates are CSS pixels relative to the **original screenshot origin**, including when rendering a crop. An element screenshot has its own origin. With browser zoom at 100%, scale is the captured pixels per CSS pixel. Rectangles use left, top, right, bottom with exclusive right/bottom edges. Draw guides on a derivative, then measure on the clean source.

```json
{
  "scale": 2,
  "crop": [10, 60, 250, 96],
  "guides": [{"name": "tab midpoint", "axis": "y", "at": 78}],
  "regions": [
    {"name": "folder icon", "box": [14, 65, 36, 92], "ink": "#243343",
     "tolerance": 24, "guide": "tab midpoint", "anchor": "center"}
  ]
}
```

```sh
python3 "$SKILL/scripts/guides.py" evidence/tab-clean.png tab-guides.json evidence/tab-guided.png
```

An x guide is vertical, a y guide horizontal. Set a region's anchor to `start`, `center`, or `end` along that guide's axis. A positive delta means right or down. The tool boxes pixels within the configured maximum per-channel RGB distance of the specified ink color; isolate a single mark on a distinct opaque background. It prints the ink bounds in source pixels and offsets in CSS pixels. Regions are optional for manually judged alignment. For a pure guide overlay, supply only guides and an optional crop.

To sample a solid interior pixel, use an image editor's eyedropper or the command below. Its x and y are **source image pixels**. At 2×, CSS point (40, 110) is image point (80, 220). Use a point inside the stroke and visually verify the resulting ink outline.

```sh
python3 -c 'from PIL import Image; import sys; im = Image.open(sys.argv[1]).convert("RGB"); print("#%02x%02x%02x" % im.getpixel((int(sys.argv[2]), int(sys.argv[3]))))' evidence/tab-clean.png 80 220
```

If a measured box touches the region edge, inspect clipping and rerun with more room. Look at the outline and ensure it encloses the intended mark alone. Sparse antialiasing, gradients, multicolor artwork, shadows and variable backgrounds may defeat a single-color mask. In that case compare crops visually or use a more suitable mask. Test a nearby threshold when a borderline result drives a fix.

## Decide what a measurement proves

- A CSS box can center perfectly while the visible icon sits low inside it. Test both if the claim concerns optical alignment.
- For glyphs, the center of the measured ink bounds is one reproducible measurement. Optical balance also depends on the shape, typeface and neighboring elements. Check at actual size with the guides off.
- Set acceptance from the reference, design tokens or an intentionally matched sibling. A half CSS pixel can correspond to a whole device pixel at 2×. Report that difference and its visual impact; avoid a universal zero-offset rule.
- Preserve before and after at identical viewport, scale and state. Use overview evidence for hierarchy and detailed crops for localized findings. A marked-up crop by itself cannot establish that the rest of the screen was inspected.

A guide defaults to the dashed `reference` role. Use `"role": "observed"` for a measured solid edge or `"role": "grid"` for a dotted supporting line. Measured regions use the observed outline. An explicit guide `color` still overrides its stroke and swatch. When the legend needs more width than the crop, the tool puts a clean copy beside the guides. Matching captions give any extra magnification. Labels follow the [proof style guide](proof-style.md). For a monochrome pixel difference map, set `"differencePalette": "grayscale"` in the pixel-proof manifest. The source RGB values and measurement classes are preserved.
