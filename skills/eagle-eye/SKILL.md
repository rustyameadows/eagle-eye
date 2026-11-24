---
name: eagle-eye
description: Audit a rendered screen, component, user flow, or site for visual imperfections and inconsistencies. Use for a systematic design critique, screenshot-guided alignment and polish, or repeated visual refinement with documented coverage and verified fixes.
---

# Eagle Eye

Find small, consequential defects by looking at an interface at three scales. At screen scale, ask where the eye lands and whether the next action reads clearly. At component scale, compare like elements across the product. At pixel scale, identify the exact edge, baseline, or ink shape that explains a perceived mismatch.

## Establish the audit

- Respect the requested scope. For an audit or critique, collect findings and proposed fixes. When the user asks for refinement or implementation, edit the design and run verification cycles. If the target is a supplied image, work on a copy, mark the visible regions and identify which states and scales the image supports.
- Start a living report in the target repo at `docs/eagle-eye/<run>/AUDIT.md` (or its established audit location). Copy [the report template](assets/AUDIT.md) into a new run directory and put evidence beside it. For a resumed audit, update the existing run. Fill in scope, version, environment, comparison target and initial coverage before inspecting. Update it **as work happens** after each inspected screen/state, confirmed finding, applied fix, and verification capture. Use relative evidence links that still work from the repo.
- For a whole site, build the inventory from the route definitions, visible navigation and important flows. Record route, reachable overlays, shared template and distinct data/role states. Identify what repeats and what varies. If a template represents multiple routes, name the represented routes and mark them sampled. Reconcile unvisited routes before declaring coverage. For one screen, inventory its regions, boundaries and overlays instead.
- Use [audit targets](references/audit-targets.md) to choose the order. Inspect high-use, high-consequence and highly reused surfaces first. Include the actual breakpoints and states that change their composition. Record access or data gaps against the affected row.

## Run the passes

1. **Read the screen at normal size.** Capture the stable state without guides. Scan from top to bottom, including below the fold. Write what draws attention first, what the user is trying to do, and any region whose hierarchy competes with that task. Compare the header, content and footer on their shared edges.
2. **Compare siblings and states.** Put comparable rows, tabs, cards, forms, and routes side by side at the same scale. Check rhythm, type roles, icon family, image crops, and whether labels stay put when controls change state. Open overlays and inspect focus, hover, selected, error, and responsive states where relevant. Stress a likely failure with real or representative long/empty content.
3. **Measure suspects.** State a testable claim and identify the intended reference line or sibling. Crop from the clean capture, add centerlines, edge rails, boxes or baseline guides on a copy, and inspect both the crop and the untouched view. Follow [capture and measurement](references/evidence.md) for local tools and coordinate rules. Use raster ink for a claim about a drawn glyph, and layout geometry for a claim about padding or a hit area. Record source, scale, measured offset and tolerance. A subjective finding needs visible evidence and the design reason; a pixel value is optional.
4. **Triage and refine.** Give each confirmed issue a stable ID, affected screens, impact, concrete correction, and verification criterion. Group repeats under the shared cause. Start with a layout or token fix where that explains several symptoms. Preserve intentional optical adjustments. In refinement mode, change one cause or a coherent batch, then re-render the *same* viewport, state, data and scale before moving on. Keep earlier captures and reopen any finding that regresses.
5. **Challenge the result.** Recheck the affected control, neighboring elements, another use of the shared component, and the breakpoint/state most likely to break. Follow with a fresh unaided scan of the full screen. New findings enter the next cycle. In critique-only mode, cycle through fresh visual angles and independent evidence until the findings are substantiated. A proposed correction stays open until a post-change capture supports it.

## Finish with evidence

Keep looping while a pass finds actionable defects or an intended fix changes something else. Close a refinement run when the scoped inventory is reconciled, actionable fixes within scope have matching post-fix evidence, and a fresh scan surfaces no new actionable issue. For an audit-only run, finish when coverage is reconciled and findings have evidence and a retest criterion. If time, access, or an ambiguous design decision ends a run sooner, record the open item, its impact and the next discriminating check. Never infer coverage from a screenshot count.

Report the highest-impact findings first, then the coverage and remaining gaps. Link the clean captures, annotated details and verification evidence. State the conditions under which the screen passed.
