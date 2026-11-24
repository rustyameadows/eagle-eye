# Maintaining Eagle Eye

The installable skill lives in `skills/eagle-eye/`. Edit the source here so the local linked installation sees changes immediately.

Keep the docs current in the same change as the behavior. Update SKILL.md when the audit decisions change, the matching reference when a measurement or command changes, and the README when setup or invocation changes. Update the report template when the recording format changes. Re-run the example when a change affects what its measurements mean. For an audit with a living log, update it as coverage, findings and verification results change.

Teach measurement methods with examples independent of the scored fixtures. Keep seeded locations, offsets, expected outcomes and earlier reviewer findings in the grading materials. Give a blind reviewer only the discovery packet and the skill.

Run the documented example and check that its evidence opens before accepting a change to the capture or guide workflow.

For changes to cross-view contracts, capture or visualization, run the [full static eval](example/view-audit/README.md). Keep all three measured reports, the separate paint/content/focus evidence, the score and the rendered handoff in sync when results or presentation change. Keep the blind packet free of answer keys and measured outcomes. Keep prior audit cycles traceable in the demo report.

For headline changes, run the [typography eval](example/headline-audit/README.md). Preserve the original rendering and the verified comparison. Freeze independent discovery and A/B responses before consulting the key, and retain their actual outcomes with the handoff.

When focused headline evidence changes, also run the [selected-headline companion](example/headline-audit/README.md#focused-headline-companion) to verify indexed visual coverage against independently measured raster changes.
