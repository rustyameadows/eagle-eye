# Eagle Eye

Eagle Eye is a Codex skill for spotting design details that feel off. It uses screenshots and visual guides to check alignment, spacing, layout shifts between views, and headline kerning.

## Install in Codex

Paste this prompt into Codex on each computer where you want to use Eagle Eye.

```text
Use $skill-installer to install https://github.com/rustyameadows/eagle-eye/tree/main/skills/eagle-eye
```

On your next turn, attach a screenshot or point Codex at a local page and try one of these prompts.

- `Use $eagle-eye on this screenshot. What looks off? Show me the strongest finding.`
- `Use $eagle-eye to evaluate this headline. Show the whole line and the spacing between letters.`
- `Use $eagle-eye to compare these two views. Show me which shared elements move.`

## Local capture tools

You can start with a screenshot. To have Eagle Eye take its own browser captures and generate pixel proofs, it uses Node.js with Playwright and Chromium, plus Python 3 with Pillow. Ask Codex to set up those tools on the new machine. For manual setup on macOS or Linux, clone this repo and run these commands from its root with Node.js, npm and Python 3 installed.

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install Pillow
```

Run the capture tools from that checkout with the Python environment active.

## Examples

See a [single-screen audit with before-and-after images](example/AUDIT.md), the [24-screen layout benchmark](example/view-audit/README.md), or the [headline typography benchmark](example/headline-audit/README.md). To explore the interactive HTML reports, open them locally from a clone of the repository.
