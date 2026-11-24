# Eagle Eye

A local Codex skill for finding visual defects across a component, screen, flow, or whole site. It inventories the target, captures the rendered interface, marks up suspected defects, and carries findings through repeated critique or implementation cycles. Each project keeps a living Markdown audit with coverage, evidence, decisions and outstanding issues.

## Use it

From the root of this checkout, link the skill into your local Codex skills directory once. The link keeps the installed skill and the working tree in sync as you edit. The destination should be unused.

```sh
skill_home="${CODEX_HOME:-$HOME/.codex}/skills"
mkdir -p "$skill_home"
ln -s "$PWD/skills/eagle-eye" "$skill_home/eagle-eye"
```

Invoke it in a new chat with a target and the kind of work you want.

- `Use $eagle-eye to audit our settings area on desktop and mobile. Report findings with screenshots and a coverage table.`
- `Use $eagle-eye to refine this tab bar. Check the visible icon and text at 1× and 2×, fix the causes, and capture each verification pass.`
- `Use $eagle-eye for a whole-site critique. Inventory routes and shared layouts, walk the primary flows, and document sampled or blocked states.`

## How the repo stays current

[SKILL.md](skills/eagle-eye/SKILL.md) defines the audit. The [target catalog](skills/eagle-eye/references/audit-targets.md) lists likely defects and how to reveal them. The [evidence guide](skills/eagle-eye/references/evidence.md) covers capture, guide recipes and interpretation. [Maintainer instructions](AGENTS.md) keep these files current alongside changes to behavior.

During an audit the agent updates the target repo's `docs/eagle-eye/<run>/AUDIT.md` as each screen is inspected, issue found, fix made and result verified. [The template](skills/eagle-eye/assets/AUDIT.md) is also usable by hand. The report and images are ordinary local files, available while work is in progress.

## Run the local example

Read the [worked audit](example/AUDIT.md) or reproduce its screenshots with the commands below. The example page uses local HTML and CSS. Install Python 3 and Pillow for overlays. For the optional capture helper, use Node 18.3+ and a local Playwright install with its matching Chromium browser. From a checkout without those packages, `npm install --no-save --package-lock=false playwright` and `npx playwright install chromium` supply the browser tool; install Pillow in your Python environment with `python -m pip install Pillow`. An existing Playwright module can be selected with the absolute path in `EAGLE_EYE_PLAYWRIGHT`. An agent with a browser tool can supply its own clean PNGs.

From the repo root in a POSIX shell, use a fresh output directory for each run:

```sh
run_dir=$(mktemp -d)
skill_dir="$PWD/skills/eagle-eye"
fixture=$(python3 -c 'from pathlib import Path; print(Path("example/screen.html").resolve().as_uri())')
(
set -e
for pass in baseline tab row final; do
  node "$skill_dir/scripts/capture.cjs" "$fixture?pass=$pass" "$run_dir/$pass.png" --width 390 --height 360 --scale 2
  python3 "$skill_dir/scripts/guides.py" "$run_dir/$pass.png" example/compact-guides.json "$run_dir/$pass-guided.png"
done
python3 "$skill_dir/scripts/guides.py" "$run_dir/row.png" example/date-guides.json "$run_dir/dates-before.png"
python3 "$skill_dir/scripts/guides.py" "$run_dir/final.png" example/date-guides.json "$run_dir/dates-after.png"
)
```

The example report includes expected offsets and links to the clean and annotated captures. Compare the measurements across the four passes.
