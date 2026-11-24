# Fieldwork design eval

[Open the audit handoff](handoff.html) to see the results, repair history and visual evidence. [Open the fixture](index.html) to inspect the static field-research journal. Its journal index links all 24 screens. The subject runs entirely from local HTML and CSS. Stable records, native links and fixed UI states keep each run repeatable. [Browse all 24 captured screens by viewport](reports/atlas.html).

## What the benchmark exercises

| Screen family | Surfaces in the corpus | Discriminating check |
| --- | --- | --- |
| Workspace shell | Inbox, Archive, a record, Settings and link return | Separate a sidebar track change from nested padding. Two simultaneous offsets partly cancel on the return path. |
| Navigation and collections | Collection list and detail, nested tree and siblings | Compare a tree label’s local inset and verify the unaffected reference alignment. |
| Searching and taxonomy | Results, empty results, tags and tag detail | Distinguish a compact input inset, chip spacing, low-contrast text, and shifted icon ink within a centered frame. |
| Geographic and quantitative views | Sites, site detail, observations and sample detail | Compare chart legend spacing, tabular text and sticky header alignment. Scroll an actual two-axis table and check the pinned corner. |
| Time and scheduling | Monthly calendar, selected date and itinerary | Compare the date inside its badge despite different surrounding layouts. |
| People and localization | Team directory, member, mixed Arabic/English instructions and a long German name | Check avatar spacing, visible keyboard focus, and isolation of a station code inside a right-to-left block. |
| Status and forms | Activity, notifications, preferences and invalid note entry | Find a displaced timeline marker and validation hint; distinguish intended wrapping from extra spacing. |
| Layered and constrained content | Review, imports, and the record’s split pane | Inspect a dialog, progress drawer, annotation popover, loading placeholders and action footer. Detect a clipped required identifier while accepting an intentionally shortened attachment. |

## Two ways to evaluate

**Measured regression.** The comparator reads the [plan](plan.json). A separate [answer key](oracle.json) defines the expected sign, activation by viewport and repair stage, and appropriate steady-state controls. The deterministic score measures whether the tooling captures and classifies those relationships. The browser suite includes a counterexample that deliberately produces a miss and a false alarm to exercise the grader.

**Blind discovery.** The run also exports an answer-hidden screenshot packet. Give that packet and the skill to a fresh reviewer. Freeze its findings before grading. The retained pilot found 18 of 20 seeded causes and two additional supported issues. It missed the Record toolbar gap and the extra half pixel inside the compact Archive row. The original submission and grader decisions are available. [Graded blind pilot](reports/blind-review/index.html) · [Clean packet](reports/blind-trial-corpus/BRIEF.md) · [Review procedure](BLIND-REVIEW.md)

## Measured run

The suite inspects 24 physical pages and a separate Inbox arrival, across 26 directed pairs. Each revision has 222 layout comparisons and 75 clean captures. Profiles are 1040 × 640 at 1×, 820 × 980 at 1×, and 390 × 720 at 2×. Eleven arrival states per profile are reached by clicking native links. The Archive return uses a document fragment so its state is deterministic without JavaScript.

| Revision | Seeded layout causes found | Drift rows | Correctly aligned rows | Intentional shifts | Unverified |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Baseline](reports/baseline/index.html) | 16 of 16 active | 46 | 173 | 3 | 0 |
| [Shared-rail repairs](reports/rails/index.html) | 10 of 10 active | 23 | 196 | 3 | 0 |
| [Final retest](reports/fixed/index.html) | All 16 repairs verified | 0 | 219 | 3 | 0 |

All three intentional shifts are the 32 px breadcrumb addition on the Record screen, observed at three widths. Several flagged rows can describe one underlying defect. [Scored layout results](reports/score.json)

A separate track tests four paint, content and keyboard defects plus three controls across the same revisions. These include intentional truncation, a scrolled sticky grid and mixed-direction text. The baseline icon is 2 CSS px low and the secondary label has a 2.25 to 1 contrast ratio. On the fixed specimen the icon centers and the ratio reaches 6.30 to 1. The focus test uses actual Tab navigation and compares painted pixels before and after focus. [Paint, content and focus evidence](reports/visual-review/index.html)

## Reproduce locally

The subject opens directly from disk. To run the eval, use Node 18.3+ with Playwright and matching Chromium plus Python 3 and Pillow. The existing linked skill on this machine can resolve the browser package. [Dependency setup](../../README.md)

From the repo root, give the runner a **new** output directory:

```sh
node example/view-audit/run-eval.cjs /tmp/fieldwork-eval-01
```

The runner materializes all three static revisions, exercises the browser and contract suites, grades the observed outcomes, writes the blind packet and renders `handoff.html`. A completed red run retains its evidence and returns a failure exit code. Pre-existing run directories are preserved.

For a quick comparison against the baseline alone:

```sh
node skills/eagle-eye/scripts/compare-views.cjs example/view-audit/plan.json /tmp/fieldwork-baseline-01
```

To change a fixture, edit [the authoring source](fixture-source/build.py) or [the stylesheet](fixture.css), then regenerate the committed static pages with `python3 example/view-audit/fixture-source/build.py`. For a deliberately changed contract, update the plan, independent expectations and matching tests together. Regenerate the evidence and handoff when a patch changes the measured result or how it is presented.

The measured scores apply to these prescribed conditions in Chromium. The corpus exercises selected localization and accessibility properties. Its screenshots do not establish overall accessibility compliance, linguistic correctness, motion quality, or cross-browser fidelity.

The companion [Fieldwork Editions typography eval](../headline-audit/README.md) covers headline kerning, tracking, fallback fonts and optical A/B review in seven static editorial views.
