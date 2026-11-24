"""Present clean headline evidence at its captured CSS size in the shared handoff."""
from collections import defaultdict
from html import escape
from urllib.parse import quote
import json
import os

from PIL import Image, ImageChops


def h(text):
    return escape(str(text), quote=True)


def url(path, output):
    return h(quote(os.path.relpath(path, output.parent).replace(os.sep, "/"), safe="/.-~"))


def link(path, text, output):
    if path and path.is_file():
        return f'<a href="{url(path, output)}">{h(text)}</a>'
    return f'<span class="note">{h(text)} (unavailable)</span>'


def picture(path, caption, output, scale=1, enlarged=False):
    if not path or not path.is_file():
        return f'<p class="note">{h(caption)} · Image unavailable</p>'
    with Image.open(path) as im:
        width = im.width / scale
    src = url(path, output)
    cls = "type-guide" if enlarged else "type-reading"
    return (f'<figure class="{cls}"><figcaption>{h(caption)}</figcaption>'
            f'<div tabindex="0" role="region" aria-label="{h(caption)}">'
            f'<a href="{src}"><img loading="lazy" src="{src}" style="width:{width:g}px" '
            f'alt="{h(caption)}"></a></div></figure>')


def panel(key, heading, content):
    return (f'<section class="chapter" id="{key}" data-slide aria-labelledby="{key}-title">'
            f'<div class="chapter-head"><h2 tabindex="-1" id="{key}-title">{h(heading)}</h2></div>'
            + content + '</section>')


def evidence_links(root, notes, output):
    return ' · '.join(link(root / path, label, output) for path, label in notes if path)


def trials_panel(cases, root, output):
    content = []
    for case in cases:
        rows = []
        for obs in case['observations']:
            files = [(obs.get('baseline'), 'Original'), (obs.get('repair'), 'Source retest'),
                     (obs.get('detail'), 'Guide')]
            measure = obs.get('measurement') or ''
            if isinstance(measure, dict):
                measure = ' · '.join(f'{k} {v}' for k, v in measure.items())
            rows.append(f'<li><strong>{h(obs["profile"])}</strong> · {h(obs["status"])}'
                        f'<span>{h(measure)}</span><small>{evidence_links(root, files, output)}</small></li>')
        content.append(f'<details class="type-record"><summary>{h(case["title"])}'
                       f'<small>{h(case["status"])}</small></summary><div class="type-record-body">'
                       + (f'<p>{h(case["observation"])}</p>' if case.get("observation") else '')
                       + (f'<p>{h(case["criterion"])}</p>' if case.get("criterion") else '')
                       + '<ul class="type-rows">' + ''.join(rows) + '</ul></div></details>')
    return ''.join(content)


def review_panel(score, root, output, cases):
    d, ab = score['discovery'], score['preference']
    body = (f'<p class="case-copy">One independent reviewer located {d["localized"]} of {d["eligible"]} '
            f'seeded issues and gave the correct direction for {d["direction"]}. '
            f'The original submission called {d["firm"]} findings and reserved {d["tentative"]} for comparison. '
            f'The review flagged {d["controlFlags"]} clean controls.</p>'
            f'<p class="case-copy">Across {ab["active"]} active A/B trials, the reviewer preferred '
            f'the repair {ab["repair"]} times and the original {ab["original"]} times, with '
            f'{ab["neutral"]} no-preference responses. Identical-image controls drew '
            f'{ab["controlNeutral"]} no-preference responses out of {ab["controls"]}.</p>')
    body += '<p class="numbers">' + evidence_links(root, [
        ('discovery.md', 'Frozen findings'), ('preferences.json', 'Frozen preferences'),
        ('adjudication.json', 'Grading decisions'), ('score.json', 'Decoded scores')], output) + '</p>'
    ballots = {r['id']: r for r in json.loads((root / 'preferences.json').read_text())['items']}
    links = evidence_links(root.parent, [('discovery/index.html', 'Original blind pages'),
                                         ('choices/index.html', 'Blinded A/B gallery')], output)
    if links:
        body += '<p class="numbers">' + links + '</p>'
    trials = []
    outcomes = {'repair': 'Preferred repair', 'original': 'Preferred original', 'neutral': 'No preference'}
    for trial in score.get('decoded', []):
        choice = ballots[trial['id']]
        outcome = outcomes.get(trial['outcome'], 'Identical pair · ' + choice['choice'])
        name = cases.get(trial['case'], {}).get('title', trial['case'])
        trials.append(f'<li><strong>{h(name)}</strong> · {h(outcome)}'
                      f'<span>{h(choice.get("reason", ""))}</span>'
                      f'<small>{h(trial["id"])} · {h(trial["profile"])}</small></li>')
    return body + '<ul class="type-rows">' + ''.join(trials) + '</ul>'


def same_pixels(left, right):
    if not left.is_file() or not right.is_file():
        return None
    with Image.open(left) as a, Image.open(right) as b:
        if a.size != b.size:
            return False
        diff = ImageChops.difference(a.convert('RGBA'), b.convert('RGBA'))
        return all(band.getbbox() is None for band in diff.split())


def source_comparison(item, matched, profile, before_profile, after_profile, root, fixed_root, output):
    if not matched:
        return '<p class="note">Source retest unavailable for this heading and profile.</p>'
    for key, default in (('width', None), ('height', None), ('scale', 1), ('theme', 'light')):
        if before_profile.get(key, default) != after_profile.get(key, default):
            return '<p class="note">Retest used different capture conditions in ' + h(profile) + '.</p>'
    matched_names, changes, missing = [], [], []
    def compare(name, before, after):
        if before is None or after is None:
            missing.append(name)
        elif before == after:
            matched_names.append(name)
        else:
            changes.append(name)
    def content(record, key, field):
        value = record.get(key)
        return value if value and value.get(field) is not None else None
    compare('wording', item.get('text'), matched.get('text'))
    compare('accessible name and role', content(item, 'accessibility', 'role'), content(matched, 'accessibility', 'role'))
    compare('selection', content(item, 'selection', 'selectable'), content(matched, 'selection', 'selectable'))
    lines = lambda i: [l['text'] for l in i.get('lines', [])] or None
    faces = lambda i: {f['familyName'] for f in i.get('fonts', []) if f.get('familyName')} or None
    compare('line breaks', lines(item), lines(matched))
    compare('rendered face', faces(item), faces(matched))
    path = fixed_root / matched['file']
    body = picture(path, 'Reopened source at reading size', output, before_profile.get('scale', 1))
    for info, names in (('Changed', changes), ('Matched', matched_names), ('Unavailable', missing)):
        if names:
            body += f'<p class="where">{info} in source retest · {h(", ".join(names))}</p>'
    for variant in item.get('variants', []):
        if variant.get('file'):
            same = same_pixels(root / variant['file'], path)
            result = 'matches' if same else 'differs from'
            if same is not None:
                body += f'<p class="where">The reopened heading {result} the candidate raster for {h(variant["id"])}.</p>'
    return body


def proof_links(item, root, output):
    proof = item.get('proof')
    if not proof:
        return ''
    sheets = [(name, 'Sheet ' + str(i)) for i, name in enumerate(proof.get('sheets', []), 1)]
    words = [(word['file'], word['word']) for word in proof.get('words', []) if word.get('file')]
    return (f'<p class="numbers">Full proof · {len(proof["boundaries"])} boundaries · '
            + evidence_links(root, sheets + words, output) + '</p>')


def headline_sections(report, source, output, eval_path=None, review_path=None, retest_path=None):
    root = source.parent
    profiles = report['profiles']
    captures = report['captures']
    headings = defaultdict(list)
    page_rows = []
    cover = ''
    for profile, views in captures.items():
        for view, cap in views.items():
            page = root / cap['file'] if cap.get('file') else None
            if not cover and page and page.is_file():
                cover = (f'<figure class="cover"><div class="cover-mat"><a href="{url(page, output)}">'
                         f'<img src="{url(page, output)}" alt="{h(view)} · {h(profile)}"></a></div>'
                         f'<figcaption>{h(view)} · {h(profile)} · Original capture</figcaption></figure>')
            for item in cap.get('headings', []):
                headings[(view, item['selector'])].append((profile, item))
            n = len(cap.get('headings', []))
            page_rows.append(f'<li>{link(page, view, output)} · {h(profile)} · {n} headings</li>')
    evaluation = json.loads(eval_path.read_text()) if eval_path else None
    title = 'Headline typography audit'
    summary = 'Read the original headline at its captured size, inspect a letter pair, and compare the proposed change across widths.'
    if evaluation:
        results = evaluation['summary']
        summary = (f'{results["passedObservations"]} of {results["observations"]} browser checks passed. '
                   f'Compare the repairs for the {results["seeds"]} seeded issues at reading size, '
                   f'then explore the {results["controls"]} clean controls.')
    metrics = [(len({v for views in captures.values() for v in views}), 'Views'), (len(profiles), 'Profiles'),
               (len(headings), 'Distinct heading locations'),
               (sum(len(i.get('variants', [])) for rows in headings.values() for _, i in rows), 'Candidate renders')]
    cards = ''.join(f'<div><dt>{h(label)}</dt><dd>{n}</dd></div>' for n, label in metrics)
    overview = (f'<section class="overview" id="overview" data-slide aria-labelledby="report-title">'
                f'<div class="hero"><div><p class="eyebrow">Eagle Eye · Typography</p>'
                f'<h1 id="report-title" tabindex="-1">{title}</h1><p class="abstract">{summary}</p></div>{cover}'
                f'</div><dl class="metrics">{cards}</dl></section>')
    sections, nav = [overview], [('overview', 'Overview')]

    def add(key, label, heading, body):
        nav.append((key, label))
        sections.append(panel(key, heading, body))

    cases = {c['id']: c for c in evaluation['cases']} if evaluation else {}
    fixed = json.loads(retest_path.read_text()) if retest_path else {}
    fixed_items = {(pid, vid, i['selector']): i for pid, views in fixed.get('captures', {}).items()
                   for vid, view in views.items() for i in view.get('headings', [])}
    candidates, other = [], []
    for (view, selector), rows in headings.items():
        if not retest_path and not any(i.get('variants') or i.get('proof') for _, i in rows):
            for profile, item in rows:
                guides = [(dt.get('file'), dt.get('pair') or dt.get('word') or 'Guide')
                          for dt in item.get('details', []) if dt.get('file')]
                scale = profiles[profile].get('scale', 1)
                faces = ', '.join(dict.fromkeys(f['familyName'] for f in item.get('fonts', []) if f.get('familyName')))
                details = picture(root / item['file'], 'Original at reading size', output, scale)
                if faces:
                    details += f'<p class="where">Rendered face · {h(faces)}</p>'
                suspects = item.get('suspects', [])
                if suspects:
                    details += '<h3>Suggestions to inspect</h3><ul>' + ''.join(
                        f'<li>{h(" · ".join(filter(None, [s.get("word"), s.get("pair"), s["observation"]])))}</li>'
                        for s in suspects) + '</ul>'
                if guides:
                    details += '<p class="numbers">Magnified details · ' + evidence_links(root, guides, output) + '</p>'
                other.append(f'<details class="type-record"><summary>{h(item["text"])}'
                             f'<small>{h(view)} · {h(profile)}</small></summary>'
                             f'<div class="type-record-body">{details}</div></details>')
            continue
        candidates.append((view, selector, rows))
    if candidates:
        has_comparisons = retest_path or any(i.get('variants') for _, _, rows in candidates for _, i in rows)
        nav.append(('headline-1', 'Reading comparisons' if has_comparisons else 'Headline proof'))
    for number, (view, selector, rows) in enumerate(candidates, 1):
        title_text = rows[0][1]['text']
        body = [f'<p class="where">{h(view)} · <code>{h(selector)}</code></p>']
        ordered = sorted(rows, key=lambda row: not bool(row[1].get('variants')))
        for idx, (profile, item) in enumerate(ordered):
            scale = profiles[profile].get('scale', 1)
            samples = item.get('variants', [])
            note = ' · ' + str(len(samples)) + ' candidate' if len(samples) == 1 else (' · ' + str(len(samples)) + ' candidates' if samples else '')
            group = [f'<details class="type-record"{" open" if idx == 0 else ""}><summary>'
                     f'{h(profile)} · {profiles[profile]["width"]} CSS px{h(note)}</summary><div class="type-record-body">']
            group.append(proof_links(item, root, output))
            fonts = ', '.join(dict.fromkeys(f['familyName'] for f in item.get('fonts', []) if f.get('familyName')))
            if fonts:
                group.append(f'<p class="where">Rendered face · {h(fonts)}</p>')
            for variant in samples:
                case = cases.get(variant['id'], {})
                group.append(proof_links(variant, root, output))
                if variant.get('css'):
                    group.append(f'<details><summary>Candidate CSS</summary><pre class="type-css">{h(variant["css"])}</pre></details>')
                if case.get('observation'):
                    group.append(f'<p class="case-copy">{h(case["observation"])}</p>')
                observed = next((o for o in case.get('observations', []) if o['profile'] == profile), {})
                match = variant.get('comparison') or {}
                before = match.get('original') or item['file']
                after = match.get('file') or variant.get('file')
                group.append(picture(root / before, 'Original at reading size', output, scale))
                if after:
                    group.append(picture(root / after, 'Style candidate · ' + variant['id'], output, scale))
                details = variant.get('details') or item.get('details') or []
                if details:
                    detail = next((dt for dt in details if dt.get('pair')), details[0])
                    original_detail = next((dt for dt in item.get('details', [])
                                            if (dt.get('pair'), dt.get('word')) == (detail.get('pair'), detail.get('word'))), None)
                    for dt, name in ((original_detail, 'Original'), (detail, 'Candidate')):
                        if dt and dt.get('file'):
                            group.append(picture(root / dt['file'], name + ' guide · ' +
                                                 (dt.get('pair') or dt.get('word') or title_text), output, enlarged=True))
                if observed.get('measurement'):
                    group.append(f'<p class="criterion">{h(observed["measurement"])}</p>')
                if observed.get('repair'):
                    group.append(f'<p class="numbers">{link(eval_path.parent / observed["repair"], "Reopened source retest", output)}'
                                 f' · {h(observed["status"])}</p>')
            if not samples:
                group.append(picture(root / item['file'], 'Original at reading size', output, scale))
            if retest_path:
                group.append(source_comparison(item, fixed_items.get((profile, view, selector)), profile,
                                               profiles[profile], fixed.get('profiles', {}).get(profile, {}),
                                               root, retest_path.parent, output))
            body.append(''.join(group) + '</div></details>')
        sections.append(panel(f'headline-{number}', title_text, ''.join(body)))

    if evaluation:
        summary = evaluation.get('summary', {})
        proof = f'<p class="intro">{link(eval_path, "Scored browser observations", output)}</p>'
        if 'passedObservations' in summary:
            proof += (f'<p class="numbers">{summary["passedObservations"]} of {summary["observations"]} '
                      f'case and viewport checks passed across {summary["seeds"]} seeded issues and '
                      f'{summary["controls"]} clean controls.</p>')
        sources = evaluation.get('revisions', {})
        if sources:
            proof += '<p class="numbers">' + evidence_links(eval_path.parent, [
                (sources.get('baseline'), 'Baseline source plan'),
                (sources.get('repaired'), 'Repaired source plan')], output) + '</p>'
        for result in evaluation.get('boundaries', []):
            files = [(result.get('baseline'), 'Original'), (result.get('repair'), 'Reopened source')]
            proof += (f'<p class="where">Tracking boundary · {h(result["width"])} CSS px · {h(result["status"])}'
                      f' · {evidence_links(eval_path.parent, files, output)}</p>')
        add('source-retests', 'Source retests', 'Repairs and clean controls',
            proof + trials_panel(evaluation['cases'], eval_path.parent, output))
    if review_path:
        add('review', 'Blind review', 'Independent visual review',
            review_panel(json.loads(review_path.read_text()), review_path.parent, output, cases))
    contact = [(name, profile + ' contact sheet') for profile, files in report.get('contactSheets', {}).items() for name in files]
    warnings = list(report.get('warnings', []))
    for profile, views in captures.items():
        for view, cap in views.items():
            warnings.extend(f'{profile} · {view} · {w}' for w in cap.get('warnings', []))
    inventory = '<p class="numbers">' + link(source, 'Inspection data', output) + '</p>'
    if warnings:
        inventory += '<h3>Coverage notes</h3><ul>' + ''.join(f'<li>{h(w)}</li>' for w in warnings) + '</ul>'
    if contact:
        inventory += '<p class="numbers">' + evidence_links(root, contact, output) + '</p>'
    inventory += '<ul class="type-inventory">' + ''.join(page_rows) + '</ul>'
    if other:
        inventory += ('<details class="type-record"><summary>Headings without candidate renders</summary>'
                      '<div class="type-record-body">' + ''.join(other) + '</div></details>')
    add('coverage', 'Coverage', 'Screens and heading inventory', inventory)
    return title, nav, sections
