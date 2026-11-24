# Evaluating a reviewer

There are two different questions worth testing here.

1. **Can the tooling measure a known defect and avoid flagging a correct control?** Run the reproducible suite. The comparator sees the declared relationships. The scorer uses an independent key with the expected signed effects, intentional shifts and controls.
2. **Can an agent discover an issue without being told where to look?** Give a fresh reviewer only Eagle Eye and the exported `blind/` directory. Its brief, screen index and clean images include viewport and arrival context. Keep the fixture source, measurement plan, runs, score, marked images and this file outside that reviewer's inputs. Opening the benchmark key contaminates discovery results.

## Conduct a blind run

Record the agent/model, skill revision, allowed tools, time budget, packet revision and tested scope before the run. For repeated trials, use equal budgets and independent fresh contexts. The checked-in examples form a regression corpus; reserve a held-out layout or new seed variant before drawing conclusions about transfer to other sites.

Have the reviewer submit a coverage table, numbered findings, screenshot references, any annotated crops, and what it could not establish. A static capture supports visual claims. It supplies limited evidence about cause, keyboard order, semantic accessibility or motion.

## Grade the submission

After the submission is frozen, open `oracle.json`, `score.json` and the paint-review results. Check each finding against the actual pixels and the scored condition. Accept equivalent descriptions when the affected component, state and direction identify the defect. If the reviewer reports a measured amount, check its sign, units and capture density. Give separate measurement-accuracy credit when the amount matches within the declared tolerance.

| Submission ID | Screenshot and profile | Matched seed or control | Disposition | Evidence and reason |
| --- | --- | --- | --- | --- |
| | | | Confirmed / duplicate / unsupported / additional valid issue / indeterminate | |

Count each seeded cause once. Combining a shared container shift and an independent interior offset into a single vague finding does not establish both. Repeated observations of the same root issue can support scope without increasing recall. An additional valid finding outside the key belongs in its own category. A reviewer with limited views is scored only against the predeclared eligible subset.

Report seeded recall as confirmed distinct seeds divided by eligible seeds. Report supported precision as supported distinct findings divided by supported plus unsupported distinct findings. Show duplicate and indeterminate counts and any unreviewed screens separately. Cite a missed case, a false alarm and a correct intentional exception if observed. Publish this result as a **blind discovery result** only after a submission has actually been graded; keep the automated regression score labeled accordingly.

The [recorded discovery pilot](reports/blind-review/index.html) retains the frozen submission, supporting crops and grading decisions. To score a new submission using the same rubric, copy the structure of its `grade.json`, list eligible seeds and adjudicate each finding. Run `node example/view-audit/grade-discovery.cjs REVIEW-DIRECTORY` beside that submission's `AUDIT.md`. The script computes metrics after adjudication.
