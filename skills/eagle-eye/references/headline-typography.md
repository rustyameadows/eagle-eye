# Audit headline typography

Start with the reading experience. Look at the clean headline at its intended CSS size, then in the surrounding page. Read the actual words. When the eye hesitates, identify the two letters that appear to part or touch, the word that breaks into apparent pieces, or the line whose rhythm changes. Record the location and direction before looking at computed styles or the inspector's suggestions.

## Choose coverage

- In a general audit, check the hero and dominant display titles in each scoped view. Include an editorial title styled as a paragraph or other element. Inspect a below-the-fold headline when it anchors a distinct part of the page. Confirm the inspector's inventory visually.
- For “evaluate my headline,” identify the named or visually dominant title. Keep the pass on that title and the responsive presentations that materially change it. Use the [focused proof](#proof-the-selected-headline) below. For “every heading,” include every rendered semantic heading and display title across the route inventory, including repeated instances and content below the fold. Identify any inaccessible states.
- A supplied image supports a visual finding. Record the original dimensions and intended display size if known. Identify the font or CSS cause from source or a live render when available. Keep uncertain diagnoses open.

## Proof the selected headline

1. **Read before diagnosing.** Record the exact copy, face actually painted, size, tracking, relevant font features, viewport and device scale. Read the clean line in the page, then alone at the same CSS size. On a screenshot-only pass, keep unverifiable font settings open. Record where reading hesitates and in which direction the space feels wrong. For independent review, give the reviewer the clean title and its context; withhold prior findings, trial styles and expected defects until the first pass is frozen.
2. **Proof every boundary.** Work along each shaped line in reading order. Mark the location of *both* neighbors of every interior grapheme, including marks and spaces. Read curves, stems, diagonals, repeated forms, punctuation and word breaks in the rhythm of the whole word and line. Repeated letters can sit differently in different contexts. A line break or a shared shaped glyph changes what can be measured. Keep the original text and native shaping intact while locating the marks.
3. **Make an optical judgment.** Assign each indexed boundary a reading-size verdict of **retain**, **try closer**, **try wider**, or **unresolved**. Group adjacent retained indexes with the same rationale. Describe each proposed change with the exact location, observed direction and effect on reading. A range locates a character; a raster sample describes ink at its sample position. If the glyphs occupy different vertical bands, inspect their full silhouettes in the word. An absent numerical sample still needs a visual judgment. A candidate shortlist alone cannot establish full coverage.
4. **Test the cause and scope.** Compare the original with one controlled alternative on the same page at the same scale. If tracking changed globally, treat that rendering as its own stage and assess the remaining local rhythm. Try a targeted correction only where it improves the word at reading size. Compare the adjoining boundaries, overall line length, wrapping and narrow layout. Where alternatives are close, review unlabelled A/B crops with room for “no preference.”
5. **Finish on the headline.** Re-read the chosen full line without guides, then show the reading-size comparison and a magnified detail for each material concern. Publish which boundaries were retained or unresolved, which changes were only previewed and which source changes were verified. Stop when the selected title and relevant widths have explicit outcomes.

## Gather comparable evidence

The local inspector accepts an HTML path, a URL, or a view plan with the existing profiles and views structure. Use a fresh destination for each pass. These commands run from the skill checkout, with the target path and selector adapted to the project.

```sh
node skills/eagle-eye/scripts/inspect-headlines.cjs example/headline-audit/plan.json /tmp/type-hero-01
node skills/eagle-eye/scripts/inspect-headlines.cjs example/headline-audit/plan.json /tmp/type-all-01 --scope all
node skills/eagle-eye/scripts/inspect-headlines.cjs article.html /tmp/type-title-01 --selector 'main h1' --width 390 --height 720 --scale 2
```

Selecting a heading with `--selector` enables the focused proof automatically. Add `--proof` to a hero or all-heading run when those headings need the same depth. Inspect each heading’s `proof.sheets` and its numbered `proof.boundaries` in `report.json`; use each sheet alongside the original-size crop. Indexes identify occurrences in logical text order. Use the rendered line for visual order in bidirectional text. `proof.words` links each indexed occurrence to an intact magnified word and its local boundaries. The visual-only label marks a boundary whose geometry or ink cannot support a numerical estimate. A contact sheet helps locate the title. Capture at the browser's native device scale. Display a 2× screenshot at half its raster width for the reading-size check. Magnify a copy for close inspection. Range guides locate graphemes in the shaped line. Italic overhangs, round strokes, and diagonal shapes can extend beyond their layout boxes. Joined scripts and ligatures can share a glyph. Preserve the clean render for each comparison. The orange segment, when present, samples the space between painted strokes on one scanline. It is a clue for horizontal Latin pairs on a sufficiently flat background. Use the original shaped word for ligatures, joined scripts, vertical type and textured backgrounds.

| What catches the eye | Discriminating check | Candidate to try |
| --- | --- | --- |
| One pair looks split or collides | Compare the pair, its neighbors, and the same sequence elsewhere in the same face and size. Look for an inline boundary, local offset, or disabled kerning. | Restore native shaping or remove the local offset. |
| All letters in a title are crowded or dispersed | Compare equivalent headings and the same heading across widths. Deliberate spaced capitals can be correct. | Adjust the heading's tracking rule at the affected size. |
| Several pairs change and letterforms look different | Compare the actual rendered faces with the intended family and weight. Check loaded resources, fallback runs, optical sizing, and variable axes supported by the actual face. | Correct font loading, the winning font rule, or a specific erroneous axis override. |
| A diagonal pair or ligature has unusual internal space | Read the word at normal size with guides hidden. Try the alternative beside an untouched control. | Retain the original when the alternative has no clear advantage. |
| Words crowd together or one line wraps early | Check word spacing, available inline size, breaks, and line-level typography independently. | Correct the verified cause and recheck nearby wrapping widths. |

## Test and apply a correction

Use a variants JSON array with one change per hypothesis. Scope the CSS to the target. This example changes native kerning for one heading. Choose the trial from the visual observation and the source evidence.

```json
[{"id":"native-kern","selector":"main h1","css":"main h1 { font-kerning: normal; }"}]
```

Run the inspector with `--variants variants.json`. Compare the clean original and candidate at the same CSS size, then inspect the indicated word and its neighbors with guides. For a subjective change, shuffle the order or ask an independent reviewer and allow “no preference.” A numerical gap or changed screenshot establishes a difference; a confirmed finding also needs a visible symptom and a plausible correction. A CSS setting can have no effect in the chosen face or at the inspected size.

When asked to fix, correct the font or shared rule when it explains the issue. For stable, art-directed copy, a remaining single pair can justify a small local adjustment. Keep it scoped to that exact word, face and intended style. Start from a naturally shaped run. Check carefully that a new inline boundary preserves kerning, ligatures, joining and wrapping. Preserve the original text, copy/paste behavior and accessible name. Use native shaping for translated or changing strings. Never insert spacing characters into editorial copy to kern it.

Apply the selected correction in source and reopen the page in a fresh render. Match the original state, font load, viewport, and scale. Check the complete word, neighbors, relevant wrap thresholds and a second instance for shared rules. Recheck the compact view even for desktop art direction. Record any changed wraps or font fallback with the evidence. If a candidate improves only the enlarged crop, keep the original or record the unresolved choice.

## Handoff

For an every-pixel request, generate the [native pixel comparison](handoff.md#full-raster-evidence-for-a-focused-headline) for the complete title. Use the same viewport rectangle around the union of all stages. Preserve every native pixel including antialiasing and background. Supply clean reading-size renders, a signed change map and a way to inspect the original and revised channel values at any coordinate. Connect the optical verdict to the word and adjacent forms. When testing a preference across several widths, vary which side holds the alternative and include an identical-image control.

Update the living audit with each decision. Include the exact text, pair or whole-run symptom, direction, actual face if known, proposed correction and scope. For a focused proof, keep a compact register of boundary indexes and human verdicts beside the proof sheets. Retain the original-size full line, the reading comparison, magnified guide details and a clean page. Identify which version came from a temporary style experiment and which came from an independently reloaded source change. To present the inspection, use the [headline handoff](handoff.md#render-a-headline-inspection).
