"""Build an offline, presentation-ready handoff from saved Eagle Eye reports."""
import argparse
import base64
import io
import json
import os
import sys
from collections import Counter
from html import escape
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
KEY = ("profile", "from", "to", "check")
STATUSES = {"aligned", "expected", "drift", "unverified"}


def h(value):
    return escape(str(value), quote=True)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def num(value, signed=False):
    if value is None:
        return "—"
    return ("+" if signed and value > 0 else "") + f"{value:.4f}".rstrip("0").rstrip(".")


def label(value):
    return str(value).replace("-", " ").capitalize()


def row_key(row):
    return tuple(row[k] for k in KEY)


def profile_spec(stage, profile):
    p = stage["plan"]["profiles"].get(profile, {})
    return (p.get("width"), p.get("height"), p.get("scale"), p.get("theme", "light"))


def load_stage(config, root):
    directory = root / config["id"]
    report = read(directory / "report.json")
    if report.get("version") != 1:
        raise ValueError(f"Unsupported report version in {directory}")
    rows = {row_key(row): row for row in report["rows"]}
    if len(rows) != len(report["rows"]) or any(r["status"] not in STATUSES for r in rows.values()):
        raise ValueError(f"Duplicate row or unknown measurement status in {directory}")
    plan = report["plan"]
    planned = {(profile, pair["from"], pair["to"], check)
               for pair in plan["pairs"] for profile in pair.get("profiles", plan["profiles"])
               for check in pair["checks"]}
    stage = {**config, **report, "directory": directory, "by_key": rows, "planned": planned,
             "counts": Counter(row["status"] for row in rows.values())}
    stage["required_views"] = {profile: {view for p, a, b, _ in planned if p == profile for view in (a, b)}
                               for profile in plan["profiles"]}
    stage["capture_gaps"] = [(profile, view) for profile, views in stage["required_views"].items()
                             for view in sorted(views) if not capture_path(stage, profile, view)]
    return stage


def capture_path(stage, profile, view):
    capture = stage["captures"].get(profile, {}).get(view, {})
    if capture.get("issue") or not capture.get("file"):
        return None
    path = stage["directory"] / capture["file"]
    return path if path.is_file() else None


def comparable(first, last, key):
    profile, source, target, check = key
    a, b = first["by_key"].get(key), last["by_key"].get(key)
    if not a or not b or profile_spec(first, profile) != profile_spec(last, profile):
        return False
    rule_a, rule_b = (stage["plan"]["checks"].get(check, {}) for stage in (first, last))
    if any(rule_a.get(k) != rule_b.get(k) for k in ("point", "relativeTo")):
        return False
    for view in (source, target):
        captures = [s["captures"].get(profile, {}).get(view, {}) for s in (first, last)]
        if captures[0].get("arrival") != captures[1].get("arrival"):
            return False
    return a["expected"] == b["expected"] and a["tolerance"] == b["tolerance"]


def finding_status(first, last, key):
    a, b = first["by_key"].get(key), last["by_key"].get(key)
    if not b or b["status"] == "unverified":
        return "Unverified", "warn"
    if b["status"] == "drift":
        return "Open", "open"
    if not comparable(first, last, key):
        return "Retest changed", "warn"
    if not all(capture_path(stage, key[0], view) for stage in (first, last) for view in key[1:3]):
        return "Evidence missing", "warn"
    if a and a["status"] == "drift":
        return "Verified repair", "good"
    return ("Intended change" if b["status"] == "expected" else "Aligned"), "good"


def pill(text, style):
    return f'<span class="pill {style}">{h(text)}</span>'


def table(headers, rows, caption):
    heads = "".join(f'<th scope="col">{h(item)}</th>' for item in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>" for cells in rows)
    return (f'<div class="scroll-table" tabindex="0" role="region" aria-label="{h(caption)}">'
            f'<table><caption class="sr">{h(caption)}</caption><thead><tr>{heads}</tr></thead>'
            f'<tbody>{body}</tbody></table></div>')


def section(id_, group, title, body, intro=""):
    return (f'<section class="chapter" id="{h(id_)}" data-slide aria-labelledby="title-{h(id_)}">'
            f'<div class="chapter-head"><p class="eyebrow">{h(group)}</p>'
            f'<h2 tabindex="-1" id="title-{h(id_)}">{h(title)}</h2>'
            + (f'<p class="intro">{h(intro)}</p>' if intro else "") + "</div>" + body + "</section>")


def href(path, output):
    return quote(os.path.relpath(path, output.parent).replace(os.sep, "/"), safe="/.-~")


def link(path, text, output):
    return f'<a href="{h(href(path, output))}">{h(text)}</a>'


def stage_links(stage, output):
    return " · ".join(link(stage["directory"] / name, title, output)
                      for name, title in (("index.html", "Compare views"), ("AUDIT.md", "Audit log"),
                                          ("report.json", "JSON"))
                      if (stage["directory"] / name).is_file())


def expected_position(row):
    positions = row["b"]["positions"]
    return (positions[1] if len(positions) > 1 else 0) + row["a"]["value"] + row["expected"]


def annotated_crops(stages, key):
    """Use one common CSS crop rectangle and overlay the local intended and observed edges."""
    profile, _, target, check = key
    reference = stages[0]
    if any(not comparable(reference, stage, key) for stage in stages):
        return None
    width, height, scale, _ = profile_spec(reference, profile)
    rule = reference["plan"]["checks"][check]
    anchor, edge = rule["point"]
    horizontal = edge in {"left", "right", "centerX"}
    patches = []
    for stage in stages:
        row = stage["by_key"].get(key)
        path = capture_path(stage, profile, target)
        source_path = capture_path(stage, profile, key[1])
        box = stage["captures"].get(profile, {}).get(target, {}).get("anchors", {}).get(anchor, {}).get("box")
        if not (path and source_path and box and row and row.get("delta") is not None):
            return None
        patches.append((path, box, row["b"]["positions"][0], expected_position(row)))
    coords = [x for _, _, actual, intended in patches for x in (actual, intended)]
    # Frame the label next to its measured edge; expand for larger differences.
    span = max(coords) - min(coords)
    crop_w = min(width, max(174, span + 60) if horizontal else 174)
    crop_h = min(height, 78 if horizontal else max(78, span + 32))
    box = patches[0][1]
    if horizontal:
        x = (max(coords) - crop_w * .75 if edge == "right" else min(coords) - crop_w * .25)
        y = (box["top"] + box["bottom"] - crop_h) / 2
    else:
        x = box["left"] + min(85, (box["right"] - box["left"]) / 2) - crop_w / 2
        y = min(coords) - (crop_h - span) / 2
    x, y = max(0, min(round(x), width - crop_w)), max(0, min(round(y), height - crop_h))
    rect = tuple(round(v * scale) for v in (x, y, x + crop_w, y + crop_h))
    zoom = min(4, 920 / crop_w)
    new_w, new_h = round(crop_w * zoom), round(crop_h * zoom)
    result = []
    for path, _, actual, intended in patches:
        with Image.open(path) as source:
            if source.size != (round(width * scale), round(height * scale)):
                return None
            crop = source.convert("RGB").crop(rect).resize((new_w, new_h), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(crop)
        length = new_h if horizontal else new_w

        def line(position, start, end, color):
            pos = round((position * scale - rect[0 if horizontal else 1]) *
                        (new_w / (rect[2] - rect[0]) if horizontal else new_h / (rect[3] - rect[1])))
            draw.line((pos, start, pos, end) if horizontal else (start, pos, end, pos), fill=color, width=2)
        for n in range(0, length, 12):
            line(intended, n, min(length - 1, n + 6), "#9f4806")
        line(actual, round(length * .4), length - 1, "#006c68")
        buf = io.BytesIO()
        crop.save(buf, "PNG")
        result.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
    return result


def case_study(finding, index, stages, output):
    key = tuple(finding["row"])
    profile, source, target, check = key
    first, last = stages[0], stages[-1]
    shown = [first] if len(stages) == 1 else [first, last]
    status, style = finding_status(first, last, key)
    chips = f'{pill(status, style)}<span class="where">{h(profile)} · {h(source)} → {h(target)}</span>'
    body = f'<div class="case-status">{chips}</div><p class="case-copy">{h(finding["observation"])}</p>'
    if finding.get("correction"):
        body += f'<p class="correction"><strong>Correction</strong> {h(finding["correction"])}</p>'
    if finding.get("criterion"):
        body += f'<p class="criterion"><strong>Retest</strong> {h(finding["criterion"])}</p>'
    crops = annotated_crops(shown, key)
    figures, links = [], []
    for i, stage in enumerate(shown):
        row = stage["by_key"].get(key, {})
        numbers = (f'{num(row["a"].get("value"))} → {num(row["b"].get("value"))} CSS px'
                   if row.get("delta") is not None else "Measurement unavailable")
        caption = (f'<strong>{h(stage["label"])}</strong> <span>{numbers}</span>'
                   f'<b>Δ {num(row.get("delta"), True)}</b>')
        image = (f'<img src="{crops[i]}" alt="{h(target)} detail, {h(stage["label"])}, '
                 f'measured change {num(row.get("delta"), True)} CSS pixels">' if crops else "")
        figures.append(f'<figure>{image}<figcaption>{caption}</figcaption></figure>')
        captures = []
        for view in (source, target):
            path = capture_path(stage, profile, view)
            if path:
                captures.append(link(path, view, output))
        if captures:
            links.append(h(stage["label"]) + "  " + " / ".join(captures))
    if crops and len(shown) == 2:
        body += ('<div class="crop-tools js-only" hidden><button class="mode" data-blend aria-pressed="false">'
                 'Blend captures</button><label hidden>Latest opacity <input type="range" min="0" max="100" '
                 'value="50"><output>50%</output></label></div>')
    body += '<div class="crops">' + "".join(figures) + "</div>"
    if crops:
        body += ('<p class="legend"><span class="dash"></span> Expected edge'
                 '<span class="solid"></span> Measured edge. Both guides use the destination view.</p>')
    else:
        body += '<p class="note">A matched annotated crop is unavailable for these captures.</p>'
    row = last["by_key"].get(key) or first["by_key"].get(key)
    if row:
        body += (f'<p class="numbers">Intended Δ {num(row["expected"], True)} CSS px'
                 f' <span>·</span> Tolerance ±{num(row["tolerance"])} CSS px</p>')
    if links:
        body += '<p class="evidence-links"><strong>Clean captures</strong> ' + " &nbsp; · &nbsp; ".join(links) + "</p>"
    return section(f"finding-{index}", "Evidence detail", finding["title"], body)


def hero(config, stages, root, output):
    first, last = stages[0], stages[-1]
    counts = last["counts"]
    missing = len((first["planned"] | last["planned"]) - last["by_key"].keys())
    unverified = counts["unverified"] + missing
    metrics = [(first["counts"]["drift"], "Initial drift checks"), (counts["drift"], "Latest drift checks"),
               (unverified, "Unverified or missing"), (len(stages), "Audit cycles")]
    cards = "".join(f'<div><dt>{title}</dt><dd>{value}</dd></div>' for value, title in metrics)
    cover = config.get("cover") or []
    locations = ([tuple(cover)] if len(cover) == 2 else []) + [
        (p, v) for p in first["captures"] for v in first["captures"][p]]
    picture = ""
    for profile, view in locations:
        path = capture_path(first, profile, view)
        if path:
            url = h(href(path, output))
            gallery = next((item for item in config.get("related", []) if item.get("coverLink")
                            and (root / item["path"]).is_file()), None)
            caption_link = link(root / gallery["path"], gallery["label"], output) if gallery else ""
            picture = (f'<figure class="cover"><div class="cover-mat"><a href="{url}"><img src="{url}" '
                       f'alt="{h(label(view))} at the {h(profile)} viewport"></a></div>'
                       f'<figcaption><span><b>{h(label(view))}</b> · {h(profile)} · {h(first["label"])}</span>'
                       f'{caption_link}</figcaption></figure>')
            break
    return (f'<section class="overview" id="overview" data-slide aria-labelledby="report-title">'
            f'<div class="hero"><div><p class="eyebrow">{h(config.get("subject", "Visual audit"))}</p>'
            f'<h1 id="report-title" tabindex="-1">{h(config["title"])}</h1><p class="abstract">'
            f'{h(config.get("summary", ""))}</p></div>{picture}</div>'
            f'<dl class="metrics">{cards}</dl></section>')


def register(findings, stages):
    first, last = stages[0], stages[-1]
    rows = []
    for i, finding in enumerate(findings, 1):
        key = tuple(finding["row"])
        where = f'{h(key[0])} · {h(key[1])} → {h(key[2])}'
        delta = lambda s: num(s["by_key"].get(key, {}).get("delta"), True)
        title = h(finding["title"])
        if finding.get("illustrate"):
            title = f'<a href="#finding-{i}">{title}</a>'
        details = "".join(f'<p><b>{head}</b> {h(finding[k])}</p>' for k, head in
                          (("observation", "Observation"), ("correction", "Correction"), ("criterion", "Retest"))
                          if finding.get(k))
        finding_cell = f'<div class="finding-name">{title}</div><small>{where}</small>'
        if details:
            finding_cell += f'<details class="finding-note"><summary>Notes</summary>{details}</details>'
        status, style = finding_status(first, last, key)
        rows.append([finding_cell, delta(first), delta(last), pill(status, style)])
    return section("findings", "Findings", "Finding register", table(
        ["Finding and selected check", "Initial Δ", "Latest Δ", "Latest result"], rows, "Selected finding checks"),
        "Each entry follows one representative measurement through the audit. Deltas are destination minus source, in CSS pixels.")


def cycles(stages, output):
    rows = []
    for stage in stages:
        counts = stage["counts"]
        missing = len((stages[0]["planned"] | stage["planned"]) - stage["by_key"].keys())
        row = [f'<b>{h(stage["label"])}</b>']
        row += [counts[s] for s in ("drift", "aligned", "expected")]
        rows.append(row + [counts["unverified"] + missing, stage_links(stage, output)])
    return section("cycles", "Verification", "Audit cycles", table(
        ["Pass", "Drift", "Aligned", "Intended", "Unverified or missing", "Evidence"], rows, "Audit results by pass"),
        "A check measures one relationship on one directed view pair and viewport. Several checks can point to the same cause.")


def coverage(config, stage):
    plan = stage["plan"]
    rows = []
    for profile, p in plan["profiles"].items():
        planned = [key for key in stage["planned"] if key[0] == profile]
        missing = {view for prof, view in stage["capture_gaps"] if prof == profile}
        required = len(stage["required_views"][profile])
        captured = required - len(missing)
        counts = Counter(row["status"] for row in stage["rows"] if row["profile"] == profile)
        pending = counts["unverified"] + sum(key not in stage["by_key"] for key in planned)
        rows.append([f'<b>{h(label(profile))}</b><small>{p["width"]} × {p["height"]} @ {p["scale"]}×</small>',
                     f'{captured} / {required}', len({key[1:3] for key in planned}),
                     len(planned), pending])
    body = table(["Viewport", "States captured", "Directed pairs", "Planned checks", "Unverified or missing"],
                 rows, "Latest capture coverage")
    scope = config.get("scope", [])
    limits = config.get("limits", [])
    sections = []
    for title, data in (("Inspected", scope), ("Limits", limits)):
        if data:
            sections.append(f'<div><h3>{title}</h3><ul>' + "".join(f"<li>{h(item)}</li>" for item in data) + "</ul></div>")
    if stage["capture_gaps"]:
        gaps = ", ".join(f"{p} / {v}" for p, v in stage["capture_gaps"])
        sections.append(f'<div><h3>Missing captures</h3><p>{h(gaps)}</p></div>')
    body += '<div class="scope-notes">' + "".join(sections) + "</div>"
    return section("coverage", "Scope", "Coverage and limits", body,
                   f'{stage["label"]} · {stage.get("browser", "Browser unrecorded")} · '
                   f'Reduced motion setting “{stage.get("reducedMotion", "unrecorded")}”. '
                   'A state can be a direct entry or a separately captured arrival on the same page.')


def score_section(score_path, stages, output):
    score = read(score_path)
    rows = []
    percent = lambda x: "—" if x is None else f"{100*x:.1f}%".replace(".0%", "%")
    for stage in stages:
        scored = score["stages"].get(stage["id"])
        if scored is None:
            continue
        m = scored["metrics"]
        rows.append([f'<b>{h(stage["label"])}</b>', f'{m["detectedSeeds"]} / {m["activeSeeds"]}',
                     f'{m["verifiedRepairedSeeds"]} / {m["repairedSeeds"]}', percent(m["precision"]),
                     percent(m["recall"]), m["falsePositives"], m["falseNegatives"]])
    body = table(["Pass", "Active causes found", "Repairs verified", "Precision", "Recall", "False alarms", "Misses"],
                 rows, "Scored layout fixture")
    latest = score["stages"].get(stages[-1]["id"])
    if latest:
        m = latest["metrics"]
        body += (f'<p class="note">The latest scored pass covers {m["physicalPages"]} physical pages, '
                 f'{m["captures"]} captures and {m["rows"]} layout checks across {m["profiles"]} viewport profiles.</p>')
    result = pill("Fixture checks passed" if score["passed"] else "Fixture checks need review",
                  "good" if score["passed"] else "open")
    body += (f'<p class="score-result">{result} {link(score_path, "Open scored observations", output)}</p>'
             '<p class="note">Precision and recall use individual layout checks. The two cause columns count '
             'distinct seeded defects. A dash indicates an empty denominator.</p>')
    return section("evaluation", "Fixture evaluation", "Layout detection score", body,
                   "The known layout defects and intentional changes in this fixture provide a reference for scoring these runs.")


def related_reviews(config, root, stages, output):
    parts = []
    for item in config.get("related", []):
        path = root / item["path"]
        if not path.is_file():
            continue
        parts.append(f'<h3>{link(path, item["label"], output)}</h3>')
        if item.get("description"):
            parts.append(f'<p class="note">{h(item["description"])}</p>')
        blind = root / item["blindScore"] if item.get("blindScore") else None
        if blind and blind.is_file():
            score = read(blind)
            parts.append(f'<p class="numbers"><strong>Answer-hidden review</strong> · '
                         f'{score["detected"]} of {score["eligible"]} eligible seeded causes identified. '
                         + link(blind, "Graded findings", output) + '</p>')
        source = root / item["results"] if item.get("results") else None
        if not source or not source.is_file():
            continue
        review = read(source)
        observations = {(r["stage"], r["id"]): r for r in review["rows"]}
        passed = sum(1 for s in stages for c in review["cases"]
                     if (r := observations.get((s["id"], c["id"]))) and not r.get("error")
                     and isinstance(r.get("issue"), bool) and r["issue"] == r.get("expected"))
        parts.append(f'<p class="numbers">{passed} of {len(stages) * len(review["cases"])} '
                     'observations matched the visual fixture expectations. '
                     + link(source, "Exact measurements", output) + '</p>')
        rows = []
        shown = stages[:1] if len(stages) == 1 else [stages[0], stages[-1]]
        for case in review["cases"]:
            cells = [f'<b>{h(case["title"])}</b><small>{h(case["profile"])} · {h(case["view"])}</small>']
            for stage in shown:
                row = observations.get((stage["id"], case["id"]), {})
                if row.get("error") or not isinstance(row.get("issue"), bool):
                    verdict = "Unverified"
                else:
                    verdict = "Issue observed" if row["issue"] else "Clear"
                file = source.parent / row["file"] if row.get("file") else None
                cells.append((link(file, verdict, output) if file and file.is_file() else verdict) +
                             f'<small>{h(row.get("measurement") or row.get("error") or "")}</small>')
            rows.append(cells)
        parts.append(table(["Check", *(s["label"] for s in shown)], rows, item["label"]))
    return section("related", "Additional evidence", "Companion reviews", "".join(parts)) if parts else ""


def measured_sections(config, root, output):
    stages = [load_stage(s, root) for s in config["stages"]]
    if not stages:
        raise ValueError("Supply at least one measured stage")
    findings = config.get("findings")
    if findings is None:
        issue_keys = dict.fromkeys(row_key(row) for stage in stages for row in stage["rows"]
                                   if row["status"] in {"drift", "unverified"})
        checks = {k: v for stage in stages for k, v in stage["plan"]["checks"].items()}
        findings = [dict(title=checks[key[3]]["label"], row=key,
                         observation=f'{label(key[1])} and {label(key[2])} at the {key[0]} viewport.',
                         illustrate=i < 2) for i, key in enumerate(issue_keys)]
    for finding in findings:
        if len(finding["row"]) != 4:
            raise ValueError(f'Finding needs [profile, from, to, check]: {finding["title"]}')
    sections = [hero(config, stages, root, output)]
    nav = [("overview", "Overview")]
    if findings:
        illustrated = [(i, f) for i, f in enumerate(findings, 1) if f.get("illustrate")]
        if illustrated:
            nav.append((f"finding-{illustrated[0][0]}", "Evidence"))
            sections += [case_study(f, i, stages, output) for i, f in illustrated]
        nav.append(("findings", "Findings"))
        sections.append(register(findings, stages))
    nav.extend([("cycles", "Audit cycles"), ("coverage", "Coverage")])
    sections.extend([cycles(stages, output), coverage(config, stages[-1])])
    score = root / config["score"] if config.get("score") else None
    if score and score.is_file():
        nav.append(("evaluation", "Evaluation"))
        sections.append(score_section(score, stages, output))
    related = related_reviews(config, root, stages, output)
    if related:
        nav.append(("related", "Companion reviews"))
        sections.append(related)
    return nav, sections


def manual_sections(config, root, output):
    """Present a human-reviewed audit using its recorded statuses, notes and saved evidence."""
    statuses = Counter()
    findings = []
    cover = ""
    for index, item in enumerate(config["findings"], 1):
        status = item["status"]
        badges = {"open": ("Open", "open"), "verified": ("Verified repair", "good"),
                  "unverified": ("Unverified", "warn"), "intentional": ("Intentional", "good"),
                  "awaiting-verification": ("Awaiting retest", "warn")}
        if status not in badges:
            raise ValueError(f'Unknown review status for {item["title"]}')
        figures, docs, absent, roles = [], [], [], set()
        for evidence in item.get("evidence", []):
            path = root / evidence["path"]
            if not path.is_file():
                absent.append(evidence["label"])
                continue
            name = evidence["label"]
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                roles.add(evidence.get("role"))
                url = h(href(path, output))
                figure = (f'<figure><a href="{url}"><img src="{url}" alt="{h(name)}"></a>'
                          f'<figcaption>{h(name)}</figcaption></figure>')
                figures.append(figure)
                if not cover:
                    cover = (f'<figure class="cover"><div class="cover-mat"><a href="{url}">'
                             f'<img src="{url}" alt="{h(name)}"></a></div><figcaption>{h(name)}</figcaption></figure>')
            else:
                docs.append(link(path, name, output))
        if status == "verified" and not {"before", "after"}.issubset(roles):
            status = "unverified"
            absent.append("Matched before and after evidence")
        statuses[status] += 1
        body = pill(*badges[status]) + f'<p class="case-copy">{h(item["observation"])}</p>'
        for field, title in (("correction", "Correction"), ("criterion", "Retest")):
            if item.get(field):
                body += f'<p class="criterion"><strong>{title}</strong> {h(item[field])}</p>'
        if figures:
            body += '<div class="crops">' + "".join(figures) + '</div>'
        if docs:
            body += '<p class="evidence-links">' + " · ".join(docs) + '</p>'
        if absent:
            body += '<p class="note">Unavailable evidence · ' + ", ".join(map(h, absent)) + '</p>'
        findings.append(section(f'finding-{index}', "Audit finding", item["title"], body))
    metrics = [("Recorded findings", len(findings)), ("Verified repairs", statuses["verified"]),
               ("Open", statuses["open"]), ("Awaiting verification", statuses["unverified"] + statuses["awaiting-verification"])]
    cards = "".join(f'<div><dt>{title}</dt><dd>{value}</dd></div>' for title, value in metrics)
    overview = (f'<section class="overview" id="overview" data-slide><div class="hero"><div>'
                f'<p class="eyebrow">{h(config.get("subject", "Visual review"))}</p>'
                f'<h1 tabindex="-1">{h(config["title"])}</h1><p class="abstract">{h(config.get("summary", ""))}'
                f'</p></div>{cover}</div><dl class="metrics">{cards}</dl>'
                + (f'<p class="note">Intentional differences retained · {statuses["intentional"]}</p>'
                   if statuses["intentional"] else "") + '</section>')
    nav, sections = [("overview", "Overview")], [overview, *findings]
    if findings:
        nav.append(("finding-1", "Findings"))
    passes = []
    for stage in config.get("passes", []):
        path = root / stage["log"] if stage.get("log") else None
        log = link(path, "Audit log", output) if path and path.is_file() else "—"
        passes.append([h(stage["label"]), h(stage["note"]), log])
    if passes:
        nav.append(("cycles", "Audit cycles"))
        sections.append(section("cycles", "Verification", "Audit cycles", table(
            ["Pass", "Review notes", "Evidence"], passes, "Recorded review passes")))
    scope = ""
    for title, values in (("Inspected", config.get("scope")), ("Limits", config.get("limits"))):
        if values:
            scope += (f'<div><h3>{title}</h3><ul>' + "".join(f'<li>{h(s)}</li>' for s in values) + '</ul></div>')
    if scope:
        nav.append(("coverage", "Coverage"))
        sections.append(section("coverage", "Scope", "Coverage and limits", f'<div class="scope-notes">{scope}</div>'))
    return nav, sections


def render(config, root, output):
    nav, sections = (manual_sections(config, root, output) if config.get("mode") == "manual"
                     else measured_sections(config, root, output))
    return document(config["title"], nav, sections)


def document(title, nav, sections):
    template = (ASSETS / "handoff.html").read_text(encoding="utf-8")
    nav_html = "".join(f'<a href="#{id_}">{text}</a>' for id_, text in nav)
    return (template.replace("<!--STYLE-->", (ASSETS / "handoff.css").read_text(encoding="utf-8"))
            .replace("<!--SCRIPT-->", (ASSETS / "handoff.js").read_text(encoding="utf-8"))
            .replace("<!--TITLE-->", h(title)).replace("<!--NAV-->", nav_html)
            .replace("<!--SECTIONS-->", "\n".join(sections)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("brief", type=Path, help="Handoff JSON with stages and optional finding narratives")
    parser.add_argument("output", type=Path, help="Destination HTML")
    parser.add_argument("--headlines", action="store_true", help="Read a headline inspector report")
    parser.add_argument("--eval-report", type=Path, help="Include the scored typography corpus")
    parser.add_argument("--retest", type=Path, help="Fresh inspector report after a source correction")
    parser.add_argument("--review", type=Path, help="Include frozen typography review results")
    parser.add_argument("--runs", type=Path, help="Override the directory containing saved stage reports")
    args = parser.parse_args()
    try:
        config = read(args.brief)
        root = (args.runs or args.brief.parent / config.get("runs", ".")).resolve()
        output = args.output.resolve()
        if args.headlines:
            from headline_handoff import headline_sections
            title, nav, sections = headline_sections(config, args.brief.resolve(), output, args.eval_report, args.review, args.retest)
            html = document(title, nav, sections)
        else:
            if args.eval_report or args.review or args.retest:
                parser.error("--eval-report, --review and --retest require --headlines")
            html = render(config, root, output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(html, encoding="utf-8")
        print(output)
    except (OSError, ValueError, TypeError, KeyError) as error:
        sys.exit(f"Could not render handoff: {error}")


if __name__ == "__main__":
    main()
