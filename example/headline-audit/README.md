# Fieldwork Editions typography eval

[Open the typography handoff](reports/handoff.html) for reading-size comparisons, marked letter pairs, source retests, and the frozen blind pilot.

Fieldwork Editions is a local HTML and CSS editorial collection. Open the [first edition](fixture/index.html) and follow its navigation to the other six spreads. The eval includes a tide feature, a valley atlas, a weather bulletin, a herbarium sheet, a bilingual station register, a dispatch and a night almanac. All fonts are included with their licenses.

## What this tests

| Question | Evidence |
| --- | --- |
| Can an agent recognize awkward spacing while reading a real page? | An independent reviewer receives original screenshots at their captured CSS sizes, identifies the word or pair, and records its direction. |
| Can the tooling distinguish a narrow pair, whole-heading tracking, a styling boundary and a different face? | Each seeded cause has its own source change, applicable viewport, rendered measurement and pixel comparison. |
| Does the repair improve the reading experience? | The reviewer chooses between randomized actual-size renders of the original and the source repair. “No preference” is a valid response. Identical-image trials measure spurious preference. |
| Is the correction scoped? | The runner reopens a repaired static copy, checks protected headings and inactive profiles, text selection, accessibility, wrapping, and the tracking breakpoint. |

There are eight seeded defects and eight clean controls. The controls cover a native diagonal pair, spaced capitals, ligatures, a combining accent, Arabic joining, responsive wrapping, quotation marks and numerals. The [fixture plan](plan.json) specifies 1040 × 640 at 1×, 820 × 980 at 1× and 390 × 720 at 2×. The [answer key](oracle.json) is for grading after discovery.

## Recorded outcome

The inspection covered 28 distinct heading locations on seven pages across three profiles. All 48 case-and-profile checks passed, including 20 active repairs, 24 clean control checks and four widths where a seed was inactive. The selected-heading, hero and all-heading checks passed, as did retests on either side of the 600 px tracking breakpoint. [Measurements and scope checks](reports/report.json)

In one independent pilot the reviewer confidently reported five defects and localized the other three as pairs for comparison. All eight directions were correct and no clean control was flagged. In a separately randomized A/B pass, the same reviewer preferred eight of eight repairs and expressed no preference on all three identical trials. [Original findings](reports/review/discovery.md) · [Frozen choices](reports/review/preferences.json) · [Grading and decoded results](reports/review/score.json)

A separate quick-review trial on three desktop screenshots tested the opening-pair recheck. Its [reviewer response and comparison examples](reports/review/opening-pair-recheck.md) are retained with the grading materials.

## Reproduce

From the repo root, run against a new destination. The prerequisites are the same local Node, Playwright/Chromium, Python and Pillow setup as the [main skill](../../README.md).

```sh
node example/headline-audit/run-eval.cjs /tmp/fieldwork-type-01
```

Open the generated `handoff.html` to inspect original headings at reading size, magnified guides, candidate renders and the independently reloaded source repairs. The machine checks answer whether the declared changes appeared and whether the controls were preserved. An optical judgment comes from inspecting the evidence.

## Run a blind pilot

1. Give a fresh reviewer only the skill's headline instructions and a copy of the run's `discovery/` directory. Exclude the key, source, measurements, candidate renders and presentation. Ask for the exact page IDs, words or pairs, direction, and uncertainty. Freeze the submitted Markdown as `review/discovery.md` and record its SHA-256 digest before providing alternatives.
2. Give the reviewer only `choices/` for the second pass. Use the CSS display widths in its offline gallery. Record one choice of `A`, `B`, or `no preference` and a short rationale per trial in `review/preferences.json`, with the array under `items`. Freeze and hash it before opening the private mapping.
3. Adjudicate each frozen discovery finding against the evidence. Require the correct headline plus either the exact affected pair or the correct whole-run location. For a width-specific seed, require the relevant width or matching page ID. Grade the direction separately. A visibly changed typeface supports a visual finding; specific font fallback causes require browser evidence. Count duplicate reports once and identify flagged controls and additional supported findings.
4. Write `review/adjudication.json` with the two frozen hashes and one decision per finding. Run `python3 example/headline-audit/score-review.py /tmp/fieldwork-type-01`, then add the scored pilot to the existing presentation.

```sh
python3 skills/eagle-eye/scripts/render-handoff.py --headlines /tmp/fieldwork-type-01/inspection/report.json /tmp/fieldwork-type-01/handoff.html --eval-report /tmp/fieldwork-type-01/report.json --review /tmp/fieldwork-type-01/review/score.json
```

The committed pilot retains its original randomized packets and private maps so its decisions can be replayed. A fresh run creates new neutral IDs and randomizes A/B order.

## Focused headline companion

Two editions of a static page exercise what happens when a user gives the inspector only a headline selector. Each edition is captured at 1040 px (1×) and 390 px (2×). The [capture plan](edition-proof/plan.json) supplies the pages and profiles. To generate a proof and grade it, run:

```sh
python3 example/headline-audit/edition-proof/check.py /tmp/fieldwork-editions-01
```

The run writes original page PNGs, reading-size crops, indexed sheets, enlarged word details, `report.json` and `score.json`. Its grader checks coverage in source order, selection, accessible names, wrapping and original painted ink. It locates changed spacing independently from the inspector’s clearance estimates and checks the direction and amount against the source change. The [recorded machine score](edition-proof/recorded-score.json) belongs to this companion exercise. The eight-case benchmark and its independent optical pilot have their own results above.

Open the [pixel proof of the two editions](edition-proof/pixels/index.html) to compare their complete headline shapes at both widths. The companion runner takes a shared full-line rectangle from each pair of page captures and rebuilds this viewer in the run’s `pixels/` directory.

For a fresh optical discovery trial, give a reviewer only one anonymous original page image per trial, displayed at its captured CSS width. Randomize the trials and ask “Evaluate the headline as you read it. Record any location you would change, the direction and your confidence. You can keep it as set.” Freeze those observations before sharing other editions, source, proof annotations or scores. Record the reviewer’s findings separately from machine scores.
