---
name: eagle-eye
description: Audit a rendered screen, component, user flow, or site for visual imperfections and inconsistencies. Use for a systematic design critique, view-to-view layout shifts, headline kerning and tracking, screenshot-guided alignment and polish, or repeated visual refinement with documented coverage and verified fixes.
---

# Eagle Eye

## Choose the scope

| What the user asks | Evidence that answers it |
| --- | --- |
| “Does this screen look off?” | Read one clean screenshot. Show the finding inline with one comparison to a sibling, guide or reference. If the comparison supports keeping the design, say why. |
| “Evaluate this headline” | Give the named title a [focused typography proof](references/headline-typography.md#proof-the-selected-headline). Read the whole line at its intended size, then account for every adjacent grapheme boundary, including spaces. Return the clean title, indexed guides and verdicts. |
| “Refine this flow or site” | Inventory the requested views and states, keep a living audit, and verify each repair against a matching capture. Prepare a presentation when the reviewer needs to compare screens or repair cycles. |

Find small, consequential defects by looking at an interface at three scales. At screen scale, ask where the eye lands and whether the next action reads clearly. At component scale, compare like elements across the product. At pixel scale, identify the exact edge, baseline, or ink shape that explains a perceived mismatch.

## Establish the audit

- Respect the requested scope. For an audit or critique, collect findings and proposed fixes. When the user asks for refinement or implementation, edit the design and run verification cycles. If the target is a supplied image, work on a copy, mark the visible regions and identify which states and scales the image supports.
- For work someone will resume or a site-wide audit, start a living report in the target repo at `docs/eagle-eye/<run>/AUDIT.md` (or its established audit location). Copy [the report template](assets/AUDIT.md) into a new run directory and put evidence beside it. For a resumed audit, update the existing run. Fill in scope, version, environment, comparison target and initial coverage before inspecting. Update it **as work happens** after each inspected screen/state, confirmed finding, applied fix, and verification capture. Use relative evidence links that still work from the repo.
- For a whole site, build the inventory from the route definitions, visible navigation and important flows. Record route, reachable overlays, shared template and distinct data/role states. Identify what repeats and what varies. If a template represents multiple routes, name the represented routes and mark them sampled. Reconcile unvisited routes before declaring coverage.
- Use [audit targets](references/audit-targets.md) to choose the order. Inspect high-use, high-consequence and highly reused surfaces first. Include the actual breakpoints and states that change their composition. Record access or data gaps against the affected row.

## Run the passes

Use the passes that answer the scoped question.

1. **Read the screen at normal size.** Capture the stable state without guides. Scan the available screen from top to bottom, including below the fold for a page or site audit. Identify what draws attention first and which region competes with the user's task. Compare the header, content and footer on their shared edges. In a general audit, read the dominant heading in context and investigate visible interruptions. Reserve the indexed proof for a selected headline. Inventory every heading when the user asks for that breadth.
2. **Compare siblings and states.** For a shared element that jumps between views, follow the [view-to-view audit](references/view-to-view.md). Pair the routes, identify stable edges and parent-relative gaps, and preserve one viewport origin for both screenshots. Put comparable rows, tabs, cards, forms, and routes side by side at the same scale. Check rhythm, type roles, icon family, image crops, and whether labels stay put when controls change state. Open overlays and inspect focus, hover, selected, error, and responsive states where relevant. Stress a likely failure with real or representative long/empty content.
3. **Measure suspects.** State a testable claim and identify the intended reference line or sibling. Crop from the clean capture, add centerlines, edge rails, boxes or baseline guides on a copy, and inspect both the crop and the untouched view. Follow [capture and measurement](references/evidence.md) for local tools and coordinate rules. Use raster ink for a claim about a drawn glyph, and layout geometry for a claim about padding or a hit area. Record source, scale, measured offset and tolerance. A subjective finding needs visible evidence and the design reason; a pixel value is optional.
4. **Triage and refine.** Give each confirmed issue a stable ID, affected screens, impact, concrete correction, and verification criterion. Group repeats under the shared cause. Start with a layout or token fix where that explains several symptoms. Preserve intentional optical adjustments. In refinement mode, change one cause or a coherent batch, then re-render the *same* viewport, state, data and scale before moving on. Keep earlier captures and reopen any finding that regresses.
5. **Challenge the result.** Before closing a typography pass, revisit one headline you initially accepted and one secondary heading in scope. Inspect each opening pair at reading size beside a matched example where available. Record what changed your judgment or why it held. Mark an inconclusive comparison uncertain. For a single supplied title, use its own opening pair. For repairs, also recheck affected neighbors and the breakpoint or state most likely to break.

## Finish with evidence

Close a quick critique when the evidence answers the question. In a refinement, keep looping while a pass finds actionable defects or a repair changes something else. Close the run when the scoped inventory is reconciled, fixes have matching post-fix evidence (including original view pairs and intentional variants), and a fresh scan surfaces no new actionable issue. Record any open item, its impact and the next discriminating check.

Choose the handoff for the decision the reader needs to make. Give a quick critique inline. Link the living audit when someone will continue the work. Build the [presentation view](references/handoff.md) when someone needs to review several screens or repair cycles, or asks for a presentation. Lead with the finding and put the supporting evidence beside it.
