# View-to-view layout audit

Use this pass when a shared element seems to jump between routes, tabs, panels, or entry paths. A stable screenshot can show the wrong spacing. Switching between two correctly registered views exposes it.

## 1. Choose the comparisons before measuring

List the journeys where users expect continuity. Include two siblings in the same template, a list/detail transition, a view with different content height, and a return to an earlier view where relevant. Track a direct entry and a return entry separately when navigation preserves a sidebar, scroll position, selected tab, or filter. A small product can cover all meaningful transitions. For a large one, document which view families are represented and which junctions remain untested.

| Subject | Anchor to measure | Compare against | What the combination tells you |
| --- | --- | --- | --- |
| Header logo, sidebar boundary or trailing account control | Left, center, or right border-box edge | Same viewport origin | Reveals shell movement, scrollbar changes or a different max-width container. |
| Heading and content start | Heading left and pane left | Also measure heading left minus pane left | Both edges moving with a stable inset points to the shell. A changing inset inside a stationary pane points to view padding. |
| Page heading and toolbar | Toolbar top minus heading bottom | Same relationship on the paired view | A taller heading or breadcrumb can move both elements while the gap remains correct. |
| Table labels and card contents | Label left minus row/card left | Equivalent semantic role, matched density | Isolates interior padding or an extra icon slot even if the whole list moves. |
| Repeated controls, badges, icons | Center or trailing edge, then visible ink | Stable control frame and an equivalent drawn mark | Separates a changed hit area from a glyph with internal whitespace. Use the raster guide tool for the ink check. |
| Sticky bars, dialogs, drawers | Fixed edge or gap to the anchor | Same scroll position and open state | A focus jump, scrollbar lock or shifted portal can change the origin. Test the actual interaction. |

Write down the intended relationship, its basis (shared component, design token, reference, or sibling consensus), expected signed delta and tolerance. Start at zero intended delta for a genuinely shared dimension. Set tolerance in CSS pixels for this relationship. The fixture's 0.25 px tolerance targets deterministic box geometry. For a deliberate variant, name the expected exception and quantify it when evidence permits. An unknown intention remains a design question.

## 2. Register the views

Capture the clean pair with the same engine, viewport, DPR, zoom, theme, fonts, data condition, scroll position and UI state. Exercise the route as a user would if the symptom depends on navigation. Capture after loading and transition settling. Record different scrollbar gutters, page width constraints, loaded fonts and responsive branches as possible causes. If movement is visible only *during* a transition, capture a frame sequence using the project's browser workflow and record that timing separately.

Align the two screenshots to the same viewport origin. For a detail crop, use one crop rectangle in both images. Centering each crop on its own drifting element removes the evidence. A relative measurement and a common viewport overlay answer different questions; keep both. With supplied images of uncertain origins, inspect shared landmarks first and label uncertain comparisons unverified.

## 3. Inspect, diagnose, verify

1. Alternate the clean views or move the overlay blend between its endpoints. Scan the shell, content rails, toolbar and repeated controls. Use wide and compact profiles independently.
2. Place the source and destination guide at each measured edge. Inspect the selected subject at 2×, then switch off guides and inspect the overview. For suspected icon/text ink drift, use the [raster guide workflow](evidence.md) on both clean images. DOM geometry includes CSS transforms and describes the rendered border box.
3. Record the two measurements, their signed difference (destination minus source), the intended delta, tolerance and capture links. A changed gap can result from margins, padding, border widths, a grid track, scrollbar gutter, positioning or a transform. Inspect the cascade or computed layout before naming the cause.
4. Trace correlated deltas back to the first ancestor whose relationship changes. Four descendants moving 3 px can be evidence of one defect. Preserve the affected pair list and distinguish independent compensating offsets that might hide a second defect.
5. For refinements, change one shared cause, re-run the *same* pairs and profiles into a new directory, and check a sibling and reverse/return journey. Inspect the full screen at normal size. Close a finding when its geometry and visual behavior meet the original contract and the intentional variants still pass. Record new or unverified pairs in the living audit.

## Local comparison runner

The input is a JSON plan. Supply absolute URLs or file paths relative to the plan as URLs. Each view can override a logical anchor's selector via `selectors`. Choose selectors that match exactly one rendered element. Set `ready` to identify the specific loaded view. For an arrival-dependent state, supply `arriveVia` with a starting URL and a unique, same-tab navigation link to the declared destination. The runner opens the start in a fresh page and clicks that link. For browser Back, complex signed-in flows, and nonzero scroll positions, use the project's interactive harness and record comparable images and measurements in the audit.

```json
{
  "title": "Settings page rails",
  "profiles": {"desktop": {"width": 1280, "height": 800, "scale": 1}},
  "views": {
    "profile": {"url": "http://localhost:3000/settings/profile", "ready": "[data-view=profile]"},
    "billing": {"url": "http://localhost:3000/settings/billing", "ready": "[data-view=billing]"}
  },
  "anchors": {"pane": "main", "heading": "main h1"},
  "checks": {
    "pane-start": {"label": "Pane start", "point": ["pane","left"], "tolerance": 0.25},
    "heading-inset": {"label": "Heading inset", "point": ["heading","left"], "relativeTo": ["pane","left"], "tolerance": 0.25}
  },
  "pairs": [{"from": "profile", "to": "billing", "checks": ["pane-start","heading-inset"]}]
}
```

```sh
node "$SKILL/scripts/compare-views.cjs" plan.json docs/eagle-eye/view-pass-01 --fail-on-drift
```

- Available edges are `left`, `right`, `top`, `bottom`, `centerX`, and `centerY`. A relative measurement subtracts its second edge from its first. Both edges use the same axis. A pair can limit coverage with `"profiles": ["desktop"]`.
- A pair can declare `"expect": {"title-top": {"delta": 32, "reason": "Detail header includes a breadcrumb"}}` for a named check. The expected magnitude is tested in its given direction.
- The runner uses a fresh Chromium context per profile, new pages per view, reduced motion and scroll at the viewport origin. Profiles accept `theme` as light or dark. The comparison labels direct entries and actual link arrivals. A reversed direct pair shows the sign of a geometric difference. A link-arrival capture establishes what the user sees after navigating. Use the existing capture helper's Playwright setup. The output folder must be new.
- Open `index.html` locally for linked guides, side-by-side, opacity overlay, a common 2× detail crop, and the clean overview. Use **Next issue** to move through drift and unverified checks on the current profile. **Computed spacing changes** lists differences in the sampled padding, margins, borders, gaps and transforms of the selected anchors. Use this to guide a check of their ancestors when needed. The clean PNGs sit beside `report.json`. `AUDIT.md` updates after each capture and profile. Keep diagnosis and issue history in the parent run's living report so measurements from later passes remain comparable.
- Missing, ambiguous, hidden, offscreen or unstable anchors, unexpected destinations and failed captures leave gaps. Visible border boxes can still be partially occluded. Inspect the screenshots for overlays, loading placeholders and incorrect state. The runner tests only declared anchors and view pairs.
- Exit 0 means the run completed. With `--fail-on-drift`, exit 2 indicates drift or unverified checks. Exit 1 indicates an invocation, configuration or execution failure.
