# Presenting an audit

Lead with the decision the work supports. A handoff should let someone answer three questions quickly: what you actually inspected, which findings matter, and what evidence changed the outcome.

- Name the product, user journey, revision or state, viewport profiles, and capture conditions. Count unique issues separately from repeated measurements and retests.
- Put the most consequential finding first. Show a clean crop or aligned before/after evidence, the actual offset or observation, the intended relationship, its impact, and the verification result. A small defect often needs a magnified crop and a link back to the complete screen.
- Show the work across cycles. Retain early measurements and screenshots, record why the next pass was needed, and state which previously correct controls stayed correct. Use open, fixed awaiting verification, verified, intentional, or unverified according to the observed evidence.
- Make coverage and gaps visible. Use a matrix for views, states and viewport profiles. Disclose sampling, absent states and claims the medium cannot support. Where there is no ground truth, report the observed findings and open risks.
- In an eval, separate the known defect key from discovery inputs. Score missed cases, false flags, intentional differences, and unavailable evidence. Label each result as a measurement regression or a blind review, depending on what actually ran.

When handing over several screens or repair cycles, prepare the presentation view beside the audit log. Lead the handoff with a link to the rendered presentation, then link the Markdown and the detailed reports. Verify that images and evidence links open locally at both a wide and compact viewport.

## Render a measured handoff

Use Python 3.8+ and Pillow 9.1+ with the saved outputs of `compare-views.cjs`. From the skill checkout, render the worked example with this command.

```sh
python3 skills/eagle-eye/scripts/render-handoff.py example/view-audit/handoff.json example/view-audit/handoff.html
```

For another audit, place a JSON brief beside the run directories. The following brief reads `baseline/report.json` and `retest/report.json`. A single stage presents an audit with its current open findings.

```json
{
  "title": "Library layout review",
  "summary": "The shared navigation, content inset and toolbar spacing across the library.",
  "stages": [
    {"id": "baseline", "label": "Baseline"},
    {"id": "retest", "label": "Retest"}
  ],
  "scope": ["Direct entries to Inbox and Archive at the planned widths."],
  "limits": ["Return navigation has a separate audit."]
}
```

- `runs` sets the directory containing the stages, relative to the brief. It defaults to the brief’s directory. Pass `--runs DIR` to use a different set of saved runs.
- Omit `findings` to list the drift and unverified rows observed across the runs. To group observations or prioritize their impact, supply authored findings in reading order. Each has a `title`, an `observation`, and a `row` array containing the profile, source view, destination view and check ID. Optional `correction` and `criterion` describe the fix and its retest. Set `illustrate` to `true` for the examples that deserve a magnified before/after comparison. The register shows the result of each **selected check**. Consult the complete pass reports for every affected pair.
- `cover` selects a clean opening screenshot as `["profile", "view"]`. `subject` sets the short label above the title. The example brief supplies both.
- Optional `score` points to a fixture score with the schema produced by the demo scorer. Optional `related` entries supply a `path`, `label` and optional `description` for a companion report. Both use paths relative to the runs directory. For a companion review with the demo’s visual-probe format, its optional `results` path imports measured cases and per-pass observations. To include an answer-hidden pilot, its optional `blindScore` path reads the number of detected and eligible causes from the graded submission. Set `coverLink` on one companion link to place it beside the opening screenshot. Each available report appears under its own heading.

The renderer counts individual checks from the saved reports. Missing planned comparisons and unavailable measurements remain visible. A representative repair needs matching viewport settings, anchors, expected delta, tolerance, arrival method, source captures and a passing retest. It draws the two detail crops from the same rectangle in CSS coordinates. The dashed guide shows the edge required by the source measurement and declared change. For a relative rule, that guide moves with the destination’s reference anchor. The solid guide marks the observed destination edge. Compare original PNGs to inspect the unmarked scene.

## Render a screenshot or qualitative audit

Use `"mode": "manual"` for reviews recorded in a living Markdown log. Summarize the observed result of each pass and link its original evidence. The following example references the supplied single-screen audit and uses paths relative to its `example/` directory.

```json
{
  "mode": "manual",
  "title": "File list row alignment",
  "summary": "Compare the vertical spacing of the row dates before and after the divider change.",
  "findings": [{
    "title": "Date alignment across rows",
    "status": "verified",
    "observation": "The last date sat 1 CSS px below the 40 px row rhythm.",
    "criterion": "Measure the three dates against the same 40 px pitch.",
    "evidence": [
      {"role": "before", "label": "Before the final pass", "path": "evidence/p03-dates.png"},
      {"role": "after", "label": "Final retest", "path": "evidence/p04-dates.png"}
    ]
  }],
  "passes": [{"label": "Final retest", "note": "Verified the last date moved back to its guide.", "log": "AUDIT.md"}],
  "scope": ["The three date labels in the supplied compact file list."],
  "limits": ["These crops cover one viewport and one set of dates."]
}
```

Record each manual finding as `open`, `awaiting-verification`, `verified`, `intentional` or `unverified`. Attach as many clean captures, marked crops or linked documents as the observation needs. The handoff displays a verified repair when both before and after images exist. A missing image in that pair leaves the repair unverified. The auditor establishes whether the evidence supports the finding.

Open the generated HTML directly. **Present** shows one section at a time, **←** and **→** change slides, and **Escape** returns to the reading view. Long slides scroll. The print layout includes every section. The HTML embeds the measured annotations and viewer controls. Keep the linked original reports and captures in their relative locations when sharing it.

## Render a headline inspection

Use the saved inspector report to build an offline presentation. Original and candidate crops appear at their captured CSS size with horizontal scrolling when the display is narrow. Each candidate links to its marked detail and surrounding evidence. Pages and headings with a clean baseline alone remain in the inventory.

```sh
python3 skills/eagle-eye/scripts/render-handoff.py --headlines /tmp/type-title-01/report.json /tmp/type-title-01/handoff.html
```

After editing a project, inspect the same target in a fresh run and pass `--retest /path/to/retest/report.json` to include the reopened source. The handoff compares matching selectors, profiles, text, accessibility, selection and line breaks, and checks whether the candidate pixels match the final heading crop.

In the static benchmark, add `--eval-report RUN/report.json` to include independently reopened source retests and clean controls. Add `--review RUN/review/score.json` after the blind findings and A/B choices have been frozen and scored. An inspector-only handoff labels temporary CSS changes as candidates. For a project refinement, retain the source retest and its evidence in the living audit.


### Full-raster evidence for a focused headline

When a reviewer asks for a pixel-level comparison, keep a common native image frame around the **entire** chosen headline across stages. Match the viewport origin, DPR, background, load state and scroll position. Capture the whole relevant line before deriving local crops. Use the reading-size proof and the indexed optical judgments alongside the pixel evidence.

Pass opaque PNGs and their acquisition conditions to the local comparator:

```sh
python3 skills/eagle-eye/scripts/pixel-proof.py stages.json /tmp/headline-pixels-01
```

```json
{
  "title": "Headline comparison",
  "stages": [{"id":"original","label":"Original"},{"id":"trial","label":"Browser trial"}],
  "profiles": [{
    "id":"desktop","label":"Desktop","scale":1,
    "origin":{"x":24,"y":80},
    "images":{"original":"original.png","trial":"trial.png"}
  }]
}
```

Use the offline viewer to inspect the signed per-pixel change, source values and the counts over the same frame. Optional regions are half-open rectangles in crop-local **raster pixels**, while `origin` is in viewport CSS pixels. Retain native evidence for both enlarged and reading-size comparisons. A tracking or pair change can move the rest of the line, so the count of changed pixels describes the extent of the render change. Judge improvement from the complete, clean line and its local context.

To open a specific capture from the presentation, append `?profile=<profile-id>` to the pixel viewer link.
