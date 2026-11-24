# Fieldwork · view-to-view audit

Fieldwork is a local research library with Inbox, Archive, Record and Settings views. Open the [demo](index.html) and switch views using its navigation. The [baseline comparison](reports/baseline/index.html) shows their shared rails with clean screenshots, coordinate guides and measured offsets. On the default comparison, the pane stays still while the Archive title starts 3 CSS px farther right.

## What to try in the viewer

1. **Follow the ancestor.** On wide **Inbox → Settings**, select **Content pane edge**, then **Title inset within pane**. The pane and title both move 4 px. The title still sits 30 px inside the pane. This points to the outer grid track.
2. **Find the half pixel.** On compact **Inbox → Archive**, select **First label inset within row**. The label moves an extra 0.5 CSS px inside its row. At the capture's 2× device scale that's one image pixel. Open **Computed spacing changes** to see the label transform. Toggle the guides off and use the overlay blend to judge the change at normal size.
3. **Distinguish arrivals.** Compare **Archive → Inbox** (direct entries) and **Archive → returned-inbox** (destination reached via the actual link). The compact and wide inset deltas are −3 px and −1 px respectively. Comparing direct Inbox with returned Inbox isolates a +2 px arrival-specific shift. The report captions name how each state was reached.
4. **Check an intended change.** On **Inbox → Record**, the title moves down exactly 32 px for the breadcrumb. The toolbar loses 2 px of space beneath the title. The breadcrumb stays in every revision; the toolbar gap gets repaired.

## Findings

The audit covers two viewport profiles, six directed comparisons, and 40 individual checks per revision. Several measurements can describe one cause.

| Finding | Affected views | Baseline evidence and cause | Verification |
| --- | --- | --- | --- |
| Archive content inset | Inbox ↔ Archive, both widths | The pane stays put while the interior title edge moves +3 px on entry. Archive adds 3 px to the shared left padding. | Both the absolute title edge and local inset return to their intended values. |
| Settings sidebar width | Wide Inbox → Settings | The grid's sidebar track widens from 192 to 196 px. Pane and title move together, and the local title inset holds. | Both absolute edges align; the local inset stays at 30 px. A separate image-pixel test checks the painted sidebar boundary. |
| Return-only page padding | Direct Inbox → Inbox arrived via Archive link, both widths | The return path adds 2 px to the pane's left padding. Direct load alone misses this defect. | Re-enter Inbox via the same link and compare it with direct entry. |
| Toolbar margin | Inbox → Record, both widths | The title-to-toolbar gap drops from 14 to 12 px. | Restore 14 px while retaining the 32 px breadcrumb shift. |
| Compact header padding | Compact Inbox → Settings | The top bar gains 2 px of right padding. The workspace link's right edge moves left by 2 px. | Restored compact right edge; wide layout still aligns. |
| Compact first label transform | Compact Inbox ↔ Archive | A half-pixel transform adds to the larger inherited content shift. The label-to-row measurement isolates it. | Local inset holds at 15 px; both directional checks pass. |

## Audit cycles

| Local revision | Drift checks | Aligned | Intended changes | Unverified | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| Baseline | 17 | 21 | 2 | 0 | [Interactive comparison](reports/baseline/index.html) · [Measurements](reports/baseline/AUDIT.md) |
| Shared rails repaired | 9 | 29 | 2 | 0 | [Interactive comparison](reports/rails/index.html) · [Measurements](reports/rails/AUDIT.md) |
| All six causes repaired | 0 | 38 | 2 | 0 | [Interactive comparison](reports/fixed/index.html) · [Measurements](reports/fixed/AUDIT.md) |

In the middle revision the shared Archive inset is repaired, revealing the full +2 px arrival defect on Archive → returned Inbox. The baseline −1 px delta came from two offsets partially canceling. The final run checks the same pairs and preserves the breadcrumb on both profiles.

## Run it locally

From the repository root, use Node 18.3+ with Playwright and its matching Chromium installed as described in the [main README](../../README.md). The demo uses local files and no server. The linked installation on this machine can resolve the existing browser package.

```sh
node skills/eagle-eye/scripts/compare-views.cjs example/view-audit/plan.json /tmp/eagle-eye-fieldwork-01
```

Open the new directory's `index.html`. For another run choose a fresh output directory. Add `--fail-on-drift` to use exit status in a regression check. The baseline demo deliberately returns 2 with that option.

Run the retained contract and browser suites:

```sh
node tests/view-contract.test.cjs
node tests/view-browser.test.cjs
```

The browser suite renders all three revisions and checks every expected signed delta, the 700/701 px responsive boundary, real return navigation, missing/hidden/ambiguous/offscreen anchors, incorrect destinations, a failed capture, and evidence preservation on rerun. It also exercises the offline interactive viewer and checks a painted sidebar edge independently of the DOM readings. The contract suite checks valid and invalid plans, both directions, tolerance boundaries, relative coordinates and intended deltas.

By default the browser suite cleans up its temporary run. To keep evidence, set `EAGLE_EYE_TEST_OUT` to a **new directory**. Its `baseline/`, `rails/` and `fixed/` subdirectories reproduce the tracked reports below this file. Keep the static viewer, JSON, Markdown and PNGs together when copying a report.

The automated matrix covers settled, top-of-viewport states in Chromium. It doesn't measure transient animation, browser Back, or other browser engines. The [workflow](../../skills/eagle-eye/references/view-to-view.md) describes how to extend an audit to those journeys.
