# Drawing a proof

Start with the clean capture at reading size. On its marked copy, draw the fewest strokes that let someone see what you measured. Use this convention for raster guides, grid overlays, headline details, comparisons, animations and handoff figures. It also applies when drawing by hand. The [stylesheet](../assets/proof-style.css) contains the shared colors and font stack.

| Mark | Ink | How to draw it |
| --- | --- | --- |
| Intended edge, baseline or midpoint | Indigo `#5865A9` | A 1 px dashed rail, 6 px on and 4 px off. Keep its position fixed across the two captures. |
| Observed edge or extent | Coral `#B54937` | A 1 px solid segment, small outlined box or point. Keep part of the reference visible where they coincide. |
| Measured distance | Ochre `#A25B18` | Join the two endpoints with a solid 1–2 px bracket and short perpendicular caps. Put the value beside it or in the caption. |
| Grapheme index | Violet `#84549E` | A short tick in the margin and a black index number. Keep numbers out of the letterforms. |
| Supporting grid | Slate blue `#537E91` | A 1 px dot every 5 px. Clip it to the relevant area and label its origin or interval. Use the viewer's neutral lattice for individual raster pixels. |

The stroke widths and patterns are at **display size**. Scale strokes, labels and spacing together for a 2× or 3× export. On dark, textured or similarly colored evidence, use a thin white casing behind the mark, preserving the open spaces between dashes. If two edges are too close to distinguish, enlarge a registered crop or put marks on opposite sides of it. Measure on the untouched pixels.

**Annotations.** Set labels in Helvetica regular (Nimbus Sans or Arial as substitutes), with black ink on white or white ink on black. Use 13–16 px for captions at reading size. For a measurement-led figure, a single larger number can carry the finding. Keep text out of the evidence when possible. Use sentence case, a named anchor, a signed displacement when direction matters, and explicit CSS or image pixel units beside the result. If a shared control appears on two pages, label each crop with the page or state and name the control once. Pair each hue with its line pattern, endpoint shape or a written label. Color identifies the kind of measurement even when the result is zero.

For pixel difference maps, publish the class legend with the image and retain the raw RGB inspector. The default map uses light gray for unchanged, indigo for darker, ochre for lighter, and violet for an equal-brightness color change.

**Composition.** Keep the original colors of the subject. Use white paper, a light neutral mat for an inset and a fine neutral rule to separate notes. Align captions to the crop edge. A clean view, a marked detail, and a brief reading at the same scale usually suffice. Omit decorative palette strips, logos and watermarks. For a change, keep the crop, scale, reference and mark meanings constant across stages.

**Before sharing.** Open the exported file at its intended width. Read the label and units, trace the reference to the feature, and check that the two roles remain distinguishable in grayscale. Check both a busy or dark patch and a quiet patch if the guide crosses them. In animations inspect the measurement and retest frames; in HTML also check the narrow layout. Keep the clean capture available next to the proof.
