# Where to look first

Use the site's actual tasks and surface names. The table suggests starting hypotheses. Add a row to coverage only for a surface the target has or the user specifically expects.

| Candidate | Common failure worth hunting | Comparison or state that exposes it |
| --- | --- | --- |
| App shell, navigation, tabs, breadcrumbs | Page titles drift across routes. The active style moves the label. Badge text, icon and close glyph look off-center together. | Overlay shared header captures. Compare selected/unselected, narrow width, long title and keyboard focus. Draw the toolbar centerline. |
| Entry screen, dashboard, landing page | The first focal point is incidental. Similar cards have inconsistent heading levels, insets or CTA placement. | Squint at a clean viewport, name the first three focal points, then compare two matched cards and the section below the fold. |
| Search, results, filters and lists | Chips wrap over controls, truncated values hide the distinguishing detail, and clearing a filter moves neighboring controls. | Compare empty, one, many and long results. Open a filter at a narrow width. Track the search/action edge across states. |
| Tables, data grids and dense rows | Header and body ink start on different rails. Numeric columns wander. Row actions change height or vanish at a breakpoint. | Trace the leading and trailing edges through the header and several rows. Try mixed digit lengths, missing values and a selected row. |
| Detail views, cards and media | Metadata has the weight of the title. Crops cut off meaningful content. Different images or title lengths push actions out of rhythm. | Compare two siblings with markedly different content and the same component on another route. |
| Forms, settings, sign-in, checkout | Labels, help and error text lack a common edge. Validation shifts the primary action or obscures the path to recovery. | Walk the task through empty, filled, invalid and success states where available. Inspect focus and wrapping at the tightest width. |
| Menus, dialogs, drawers and popovers | Anchor drift, clipped shadows, covered actions, misaligned columns or a focused control hidden behind a sticky footer. | Open near a viewport edge, scroll inside, tab through, close and check the return location. Compare compact and wide layouts. |
| Small primitives repeated everywhere | Icons with padded viewBoxes look off-center. Pills and button text sit at different optical heights. Borders change size on focus. | Compare visible marks at 1× and native 2× when needed. Draw a centerline and inspect a fresh clean image at normal size. |
| Responsive transitions and special states | One-pixel wrapping thresholds, intermediate layouts that fit neither breakpoint, placeholders that jump on load. | Test just below/at/above a relevant breakpoint, long translated strings when supported, empty/loading/error, and zoom when appropriate. |
| Repeated patterns across routes and themes | One implementation quietly diverges in gap, type weight, contrast, icon stroke or corner radius. | Line up equivalent screenshots with the same theme, role, data and viewport. Compare computed tokens and inspect rendered pixels. |

Use the [view-to-view audit](view-to-view.md) when switching routes exposes a shift in any of these shared surfaces.

## Choosing the next pass

- **Screen to component.** An unclear primary action deserves a hierarchy finding even if all edges line up. A one-off icon drift belongs in a focused crop.
- **Component to family.** When one row fails, test a sibling with different content and another instance of the shared component. Mark which instances you actually saw.
- **Defect to cause.** A drifting start edge might be container padding, an over-wide icon box, an SVG's inner whitespace or the first glyph's side bearing. A guide locates the discrepancy. Inspect the corresponding geometry to choose the fix.
- **Default to boundary.** Include the viewport/state where the behavior changes. A passing desktop screenshot supplies little evidence about a wrapped toolbar.
