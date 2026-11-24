# Maintaining Eagle Eye

The installable skill lives in `skills/eagle-eye/`. Edit the source here so the local linked installation sees changes immediately.

Keep the docs current in the same change as the behavior. Update SKILL.md when the audit decisions change, the matching reference when a measurement or command changes, and the README when setup or invocation changes. Update the report template when the recording format changes. Re-run the example when a change affects what its measurements mean. During an audit, update the target project's report at the moment coverage, a finding or a verification result changes.

Run the documented example and check that its evidence opens before accepting a change to the capture or guide workflow.

For changes to cross-view contracts, capture or visualization, run both suites under `tests/` as described in the [multi-view demo](example/view-audit/README.md). Regenerate the tracked baseline, shared-rail and fixed reports when their measurements or viewer change. Keep prior audit cycles traceable in the demo report.
