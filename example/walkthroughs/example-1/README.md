# Example 1

The desktop headline uses 118.08 px Young Serif Light. The audit compared the original line, a tracking change across the line and a local adjustment between the apostrophe and v.

## Measured change

The plate compares the tracking-only and shipped captures. The difference map records the pixels that became darker or lighter when “ve” moved. [Six pair-spacing trials](pair-trials.png)

![Audit plate with full headlines, magnified ink endpoints and the registered pixel difference](original-review.png)

## Inspect the originals

Open `pixels/index.html` locally. Choose a viewport, compare the three full lines at their captured CSS size, then switch to the difference view or inspect an individual pixel. Keep the folder together to use the viewer’s original PNG download links.

| Viewport | Original | Tracking only | Shipped |
| --- | --- | --- | --- |
| 1440 px · 1× | [16.97 px](pixels/rasters/desktop/stage-1.png) | [20.00 px](pixels/rasters/desktop/stage-2.png) | [9.22 px](pixels/rasters/desktop/stage-3.png) |
| 820 px · 1× | [10.63 px](pixels/rasters/tablet/stage-1.png) | [12.04 px](pixels/rasters/tablet/stage-2.png) | [5.66 px](pixels/rasters/tablet/stage-3.png) |
| 390 px · 2× | [7.43 px](pixels/rasters/phone/stage-1.png) | [8.14 px](pixels/rasters/phone/stage-2.png) | [3.91 px](pixels/rasters/phone/stage-3.png) |
| 320 px · 2× | [6.02 px](pixels/rasters/narrow/stage-1.png) | [6.73 px](pixels/rasters/narrow/stage-2.png) | [3.20 px](pixels/rasters/narrow/stage-3.png) |

The values are the shortest distances in CSS pixels between painted pixel centers of ’ and v at 50% ink coverage. The white segment in the animation connects those two recorded points. The tracking-only desktop gap of 20.00 px was almost as wide as the 20.10 px first word space. The local −0.125em adjustment kept “I’ve” together at reading size. The four source retests matched the accepted pair trial in all 186,505 pixels of the headline crops. The copy, accessible name and single-line wrapping held at all four widths. [Pair coordinates](pair.json) · [Source retest hashes](source-retest.json)

From an Eagle Eye checkout, rebuild the offline viewer and difference maps in a fresh directory with the original PNGs in this folder.

```sh
python3 skills/eagle-eye/scripts/pixel-proof.py example/walkthroughs/example-1/manifest.json /tmp/example-1-pixel-proof
```
