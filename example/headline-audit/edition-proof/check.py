"""Run the inspector on the two editions, then grade the indexed proof against painted ink."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import sys

from PIL import Image


HERE = Path(__file__).resolve().parent
INSPECTOR = HERE.parents[2] / "skills/eagle-eye/scripts/inspect-headlines.cjs"
TITLE = "Places we’ve seen"
SEED = TITLE.index("’v") + 1
TRACKING_EM = 0.16


def check(condition, message):
    if not condition:
        raise ValueError(message)


def inspect_edition(run, capture, scale):
    headings = capture["headings"]
    check(len(headings) == 1, "Expected the single selected headline.")
    heading = headings[0]
    check(heading["text"] == TITLE and heading["accessibility"]["name"] == TITLE,
          "The title or its accessible name changed.")
    check(heading["selection"]["text"] == TITLE and len(heading["lines"]) == 1,
          "The title changed selection text or wrapping.")
    check("proof" in heading, "Selecting a headline must produce a complete focused proof.")
    proof = heading["proof"]
    boundaries = proof["boundaries"]
    expected = [(i + 1, left, right) for i, (left, right) in enumerate(zip(TITLE, TITLE[1:]))]
    observed = [(r["index"], r["left"], r["right"]) for r in boundaries]
    check(observed == expected, "The focused proof omitted, duplicated or reordered a boundary.")
    check(proof["sheets"] and all((run / name).is_file() for name in proof["sheets"]),
          "A boundary sheet is unavailable.")
    check(all(bool(r.get("method")) for r in boundaries), "A boundary has no inspection method.")

    # Independent fixture oracle. Its pinned, flat, horizontal sample permits
    # segmentation by native ranges. Project painted ink across rows even when
    # the facing marks do not share a scanline.
    extents = []
    with Image.open(run / capture["file"]) as image:
        mask = image.convert("L").point(lambda value: 255 if value < 125 else 0)
        for glyph in (g for text_run in heading["runs"] for g in text_run["graphemes"]):
            b = glyph["box"]
            x, y, right, bottom = [round(v * scale) for v in
                                   (b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"])]
            ink = mask.crop((x, y, right, bottom)).getbbox()
            if glyph["text"].isspace():
                extents.append(None)
            else:
                check(ink is not None, "An expected glyph has no visible ink.")
                extents.append((x + ink[0], x + ink[2]))
    gaps = {i: (after[0] - before[1]) / scale
            for i, (before, after) in enumerate(zip(extents, extents[1:]), 1) if before and after}
    return heading, gaps


def grade(run):
    report = json.loads((run / "report.json").read_text())
    results = []
    for profile_id in ("wide", "phone"):
        scale = report["profiles"][profile_id]["scale"]
        captures = report["captures"][profile_id]
        seeded, first = inspect_edition(run, captures["north"], scale)
        clean, second = inspect_edition(run, captures["south"], scale)
        check(seeded["fonts"] == clean["fonts"], "The editions rendered different faces.")
        delta = {i: first[i] - second[i] for i in first}
        # Discover the changed boundary from the independent measurements
        # before matching it to the key. Allow one native pixel of raster rounding.
        changed = [i for i, value in delta.items() if abs(value) > 1 / scale]
        check(changed == [SEED], f"{profile_id}: unexpected changed boundaries {changed}")
        font_size = seeded["styles"]["font-size"]
        check(font_size.endswith("px"), f"{profile_id}: expected a computed font size in CSS pixels.")
        size = float(font_size[:-2])
        check(abs(delta[SEED] - TRACKING_EM * size) <= 1 / scale,
              f"{profile_id}: wrong direction or magnitude for the painted change.")
        row = seeded["proof"]["boundaries"][SEED - 1]
        # Confirm that the public, unhinted deliverable makes this occurrence
        # inspectable even when a general-purpose clearance estimate is absent.
        check(row["word"] == "we’ve" and row.get("detailFile") and (run / row["detailFile"]).is_file(),
              f"{profile_id}: source-positioned word detail is missing.")
        for heading, gaps in [(seeded, first), (clean, second)]:
            measurement = heading["proof"]["boundaries"][SEED - 1]["columnClearance"]
            if measurement:
                check(abs(measurement["cssPx"] - gaps[SEED]) <= 1 / scale,
                      f"{profile_id}: clearance disagrees with original ink.")
        results.append({"profile": profile_id, "boundariesPerEdition": len(seeded["proof"]["boundaries"]),
                        "changedIndex": SEED, "cleanCssPx": second[SEED], "seededCssPx": first[SEED],
                        "changeCssPx": delta[SEED], "publicEvidenceMethod": row["method"]})
    return results


def publish_pixels(run):
    """Register both clean page captures to the same full-title frame at each density."""
    report = json.loads((run / "report.json").read_text())
    profiles = []
    for pid, profile in report["profiles"].items():
        scale = profile["scale"]
        captures = report["captures"][pid]
        lines = [line["box"] for cap in captures.values() for line in cap["headings"][0]["lines"]]
        left = max(0, math.floor((min(b["x"] for b in lines) - 8) * scale))
        top = max(0, math.floor((min(b["y"] for b in lines) - 8) * scale))
        right = math.ceil((max(b["x"] + b["width"] for b in lines) + 8) * scale)
        bottom = math.ceil((max(b["y"] + b["height"] for b in lines) + 8) * scale)
        images = {}
        for edition, cap in captures.items():
            dest = run / pid / (edition + "-line.png")
            with Image.open(run / cap["file"]) as page:
                page.crop((left, top, min(right, page.width), min(bottom, page.height))).save(dest)
            images[edition] = dest.relative_to(run).as_posix()
        profiles.append({"id": pid, "label": f"{pid.title()} · {profile['width']} CSS px", "scale": scale,
                         "origin": {"x": left / scale, "y": top / scale}, "images": images})
    manifest = run / "pixel-manifest.json"
    manifest.write_text(json.dumps({"title": TITLE, "profiles": profiles, "stages": [
        {"id": "north", "label": "First edition"}, {"id": "south", "label": "Second edition"}]}, indent=2) + "\n")
    subprocess.run([sys.executable, INSPECTOR.with_name("pixel-proof.py"), manifest, run / "pixels"], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New directory for captures and scores")
    args = parser.parse_args()
    run = args.output.resolve()
    subprocess.run(["node", INSPECTOR, HERE / "plan.json", run, "--selector", "h1"], check=True)
    result = {"observations": grade(run)}
    publish_pixels(run)
    (run / "score.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
