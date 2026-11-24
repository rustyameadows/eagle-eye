#!/usr/bin/env python3
"""Publish the 24 standalone Fieldwork specimens. Requires Python's standard library."""
from html import escape
from pathlib import Path
from textwrap import dedent

OUT = Path(__file__).resolve().parents[1]

# Screen, title, toolbar context, toolbar destination or status.
PAGES = [
    ("inbox", "Inbox", "Unfiled field notes", "3 records"),
    ("archive", "Archive", "Closed field seasons", "2 records"),
    ("record", "Meadow survey", "Field note · NC–042", "20 Nov 2026"),
    ("settings", "Settings", "Workspace configuration", "North Coast"),
    ("collections", "Collections", "Filed notebooks", ("collection-detail", "Open sedge plots")),
    ("collection-detail", "Sedge plots", "Collection · North meadow", "6 records"),
    ("search", "Search", "Across this journal", ("search-empty", "Unmatched search")),
    ("search-empty", "Search", "Across this journal", "0 matches"),
    ("tags", "Tags", "Controlled vocabulary", ("tag-detail", "Inspect a tag")),
    ("tag-detail", "Hydrology", "Subject tag · Water", "18 records"),
    ("sites", "Sites", "North Coast stations", ("site-detail", "Open Alder Reach")),
    ("site-detail", "Alder Reach", "Station · AR–02", "Tidal channel"),
    ("observations", "Observations", "Measurement register", ("observation-detail", "Inspect sample")),
    ("observation-detail", "Sample 184", "Water quality · AR–02", "Verified"),
    ("calendar", "Calendar", "November 2026", ("itinerary", "View itinerary")),
    ("itinerary", "Itinerary", "Field visits · 23–27 Nov", "Week 48"),
    ("team", "Field team", "Journal contributors", ("member", "Open Lina’s profile")),
    ("member", "Lina Haddad", "Contributor · LH", "Active"),
    ("activity", "Activity", "Journal history", ("notifications", "Open notices")),
    ("notifications", "Notifications", "Updates for your team", "3 unread"),
    ("preferences", "Preferences", "Editor defaults", ("new-note", "View note form")),
    ("new-note", "New field note", "Draft · Validation", "2 fields to check"),
    ("review", "Review", "Submission queue", ("imports", "Inspect import")),
    ("imports", "Imports", "File intake", "Batch 026"),
]
NAMES = {page: name for page, name, _, _ in PAGES}


def url(page):
    return "index.html" if page == "inbox" else f"screen-{page}.html"


def link(page, label=None, attrs=""):
    return f'<a href="{url(page)}"{attrs}>{escape(label or NAMES[page])}</a>'


def heading(title, meta=""):
    return (f'<div class="panel-heading"><h2>{escape(title)}</h2>'
            f'<span class="small muted">{escape(meta)}</span></div>')


def panel(content, cls=""):
    return f'<section class="panel {cls}">{content}</section>'


def details(rows):
    return '<dl class="facts">' + ''.join(
        f'<div><dt>{escape(k)}</dt><dd>{escape(v)}</dd></div>' for k, v in rows) + '</dl>'


def pill(label, tone=""):
    return f'<span class="pill {tone}">{escape(label)}</span>'


def note_list(rows):
    return '<div class="panel entries">' + ''.join(
        f'<div class="entry"><div class="entry-copy"><span class="name">{n}</span>'
        f'<span class="small muted">{escape(desc)}</span></div><time>{escape(date)}</time></div>'
        for n, desc, date in rows) + '</div>'


def page_nav(page):
    entries = [
        ("Journal", [("inbox", "Inbox"), ("archive", "Archive"), ("record", "Meadow survey"),
                     ("settings", "Settings")]),
        ("Field desk", [("collections", "Collections"), ("sites", "Sites"),
                        ("observations", "Observations"), ("calendar", "Calendar")]),
    ]
    groups = []
    for title, choices in entries:
        items = []
        for dest, label in choices:
            href = url(dest) + ("#journal" if page == "archive" and dest == "inbox" else "")
            current = ' aria-current="page"' if dest == page else ""
            items.append(f'<a data-route="{dest}" href="{href}"{current}>{label}</a>')
        groups.append(f'<div class="nav-group"><p>{title}</p><div>{"".join(items)}</div></div>')
    return '<nav aria-label="Journal navigation">' + ''.join(groups) + '</nav>'


def layout(page, title, context, status, content):
    directory = ''.join(link(id_, name if id_ not in ("search-empty", "search") else
                             ("Unmatched search" if id_ == "search-empty" else "Search results"))
                        for id_, name, _, _ in PAGES)
    meta = (link(*status, attrs=f' data-open="{status[0]}"') if isinstance(status, tuple)
            else f'<span>{escape(status)}</span>')
    crumb = ('<div class="crumb">' + link("inbox", "← Inbox") + '</div>') if page == "record" else ""
    return dedent(f"""\
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>{escape(title)} · Fieldwork</title>
          <link rel="stylesheet" href="fixture.css">
        </head>
        <body id="journal" data-view="{page}" data-revision="baseline" data-ready>
          <header class="bar">
            <a class="brand" href="index.html"><span class="sigil" aria-hidden="true"></span>Fieldwork</a>
            <div class="bar-links">
              <details class="directory"><summary>Journal index</summary>
                <div class="directory-list">{directory}</div>
              </details>
              <a class="workspace" href="screen-settings.html">Workspace settings</a>
            </div>
          </header>
          <div class="shell">
            <aside class="sidebar">
              <div class="station"><b>North Coast</b><span>Research station</span></div>
              {page_nav(page)}
            </aside>
            <main>
              {crumb}<h1>{escape(title)}</h1>
              <div class="toolbar"><span>{escape(context)}</span>{meta}</div>
              <div class="content">{content}</div>
            </main>
          </div>
        </body>
        </html>
    """)


def inbox_archive(archived):
    if archived:
        return note_list([
            ("Spring census", "North meadow · Vegetation", "16 Apr"),
            ("Estuary observations", "Alder Reach · Water", "22 Mar"),
        ]) + '<p class="caption">Closed records retain their original station and collection.</p>'
    return note_list([
        (link("record", "Meadow survey", ' data-route="record"'), "North meadow · J. Reyes", "20 Nov"),
        ("Coastal transect", "Outer ridge · L. Haddad", "18 Nov"),
        ("Wetland index", "Alder Reach · M. Chen", "12 Nov"),
    ]) + '<p class="caption">Dates follow station time, Pacific Standard Time.</p>'


def record():
    return panel('<article class="article"><div class="byline">J. Reyes <span>North meadow</span></div>'
                 '<p class="lede">Standing water reached the lower edge of the sedge plot after the first frost.</p>'
                 '<h2>At the western marker</h2><p>The upper stake remained dry. Three bands of flattened stems '
                 'marked the waterline along the south fence. We measured from the painted collar on stake B.</p>'
                 '<blockquote>Repeat the transect at low water in early spring.</blockquote>'
                 '<p class="caption">Notebook 6, leaf 42 · Transcribed 21 November</p></article>')


def settings():
    return panel(heading("Journal settings", "Workspace") + details([
        ("Workspace name", "North Coast Research Station"), ("Default collection", "Inbox"),
        ("Station timezone", "America/Los_Angeles"), ("Coordinate system", "WGS 84 · decimal degrees"),
    ])) + panel(heading("Contributor access", "4 members") + '<div class="panel-pad">' +
                link("team", "Field team directory") + '</div>')


def tree(collection):
    active = "Sedge plots"
    items = [('1', 'North Coast stations', '4 notebooks'), ('2', 'North meadow', '2 collections'),
             ('3', active, '6 records'), ('3', 'Frost line', '4 records'),
             ('2', 'Alder Reach', '2 collections'), ('3', 'Water profiles', '12 records')]
    tree_rows = []
    for n, (level, name, total) in enumerate(items):
        row_class = ' tree-row' if n == 2 else ''
        label_class = ' tree-label' if n == 2 else ''
        node = '▾' if n in (0, 1, 4) else '·'
        tree_rows.append(f'<li class="tree-item level-{level}{row_class}">'
                         f'<span class="tree-name{label_class}"><i aria-hidden="true">{node}</i>{name}</span>'
                         f'<span class="small muted">{total}</span></li>')
    branch = panel(heading("Notebook tree", "3 levels") +
                   '<ul class="tree">' + ''.join(tree_rows) + '</ul>')
    if collection:
        return branch + panel(heading("Inside Sedge plots") +
            '<div class="panel-pad"><p>Quadrat returns from the north edge of the meadow.</p>'
            + link("record", "Meadow survey · NC–042") + '</div>')
    return branch + panel(heading("Shared collections") + details([
        ("Exchange notebook", "Estuary partnership"), ("Specimen cabinet", "Botany desk")]))


def search(empty):
    term = 'blackwater hemlock' if empty else 'meadow'
    field = (f'<div class="query-box"><span class="query-text">{term}</span>'
             '<kbd>/</kbd></div><div class="filter-line">Search in <b>All records</b>'
             '<span>·</span> Include archived</div>')
    if empty:
        return field + panel('<div class="empty"><span class="lens" aria-hidden="true"></span>'
            '<h2>No matching records</h2><p>Try a station name or remove one of the words in your search.</p>'
            '<span data-visual="contrast">Archived records were included.</span></div>')
    return field + panel(heading("Matching notes", "3 of 3") +
        '<ol class="matches"><li>' + link("record", "Meadow survey") +
        '<p>The upper <mark>meadow</mark> remained dry near stake B.</p></li>'
        '<li>Late-season census<p>Photographs from the north <mark>meadow</mark> plot.</p></li>'
        '<li>Frost line<p>Reference transect along the <mark>meadow</mark> fence.</p></li></ol>')


def tags(detail):
    tag = ('<span class="taxonomy-tag"><span class="tag-swatch"></span>'
           '<span class="tag-label">Hydrology</span></span>')
    if detail:
        return panel(heading("Selected term", "TAG–014") + '<div class="tag-board">' + tag +
            '</div>' + details([("Broader term", "Water"), ("Related term", "Flow velocity"),
                                ("First applied", "14 March 2025")])) + panel(
            heading("Associated records") + '<div class="panel-pad">' + link("observation-detail", "Sample 184") + '</div>')
    glyph = ('<svg data-visual="ink" class="ink-icon" width="20" height="20" viewBox="0 0 20 20" '
             'role="img" aria-label="Filled plot marker"><path fill="#254c3c" d="M4 4h12v12H4z"/></svg>')
    plain_glyph = ('<svg class="ink-icon" role="img" aria-label="Hollow plot marker" width="20" height="20" '
                   'viewBox="0 0 20 20"><path fill="#254c3c" fill-rule="evenodd" '
                   'd="M4 4h12v12H4zM6 6v8h8V6z"/></svg>')
    return panel(heading("Subject tags", "6 terms") + '<div class="tag-board">' + tag +
        ''.join(pill(x) for x in ["Vegetation", "Tidal cycle", "Weather", "Soils", "Transect"]) +
        '</div>') + panel(heading("Plot symbols", "Field legend") +
        f'<div class="symbol-list"><div>{glyph}<span>Permanent plot</span></div>'
        f'<div>{plain_glyph}<span>Temporary plot</span></div></div>')


def station_chart(detail):
    high = [48, 56, 51, 39, 44, 58, 64, 57]
    low = [22, 28, 26, 32, 24, 36, 42, 33]
    def line(series):
        return ' '.join(f'{60+i*52},{108-v}' for i, v in enumerate(series))
    grid = ''.join(f'<line x1="45" y1="{108-v}" x2="441" y2="{108-v}"/>'
                   f'<text x="35" y="{112-v}" text-anchor="end">{v}</text>' for v in (0, 25, 50, 75))
    graph = (f'<svg class="hydrograph" role="img" viewBox="0 0 460 134" aria-label="Water level in centimeters, '
             'first through eighth of November. Alder Reach ranged from 39 to 64, Salt Creek from 22 to 42.">'
             f'<g class="plot-grid">{grid}</g><polyline points="{line(high)}" class="reach-line"/>'
             f'<polyline points="{line(low)}" class="creek-line"/>'
             '<text x="54" y="127">01 Nov</text><text x="205" y="127">04 Nov</text>'
             '<text x="395" y="127">08 Nov</text></svg>')
    legend = ('<div class="legend"><span class="legend-pair"><i class="legend-key"></i>'
              '<span class="legend-label">Alder Reach</span></span>'
              '<span class="legend-pair"><i class="creek-key"></i><span>Salt Creek</span></span></div>')
    chart = panel(heading("Water level", "cm · staff gauge") + legend + graph)
    if detail:
        return chart + panel(heading("Station record", "AR–02") + details([
            ("Coordinates", "47.609° N, 122.391° W"), ("Datum", "Local staff zero"), ("Last visit", "20 November")]))
    return chart + panel(heading("Active stations") + details([
        ("AR–02", "Alder Reach"), ("SC–01", "Salt Creek"), ("NM–04", "North meadow")]))


READINGS = [
    ("AR–184", "08:10", "12.4", "8.1", "Clear"), ("AR–185", "08:25", "12.6", "8.0", "Clear"),
    ("SC–119", "09:15", "11.8", "8.8", "Silt"), ("NM–042", "09:40", "10.2", "7.9", "Peat"),
    ("AR–186", "10:05", "12.9", "7.8", "Clear"), ("SC–120", "10:20", "12.2", "8.4", "Silt"),
    ("AR–187", "11:10", "13.4", "7.7", "Clear"), ("NM–043", "11:25", "10.9", "7.8", "Peat"),
    ("SC–121", "11:40", "12.5", "8.2", "Silt"), ("AR–188", "12:15", "13.7", "7.6", "Clear"),
]


def observations(detail):
    rows = READINGS[:3] if detail else READINGS
    head = ('<thead><tr><th scope="col" class="column-head"><span class="column-label">Sample</span></th>'
            '<th scope="col">Time</th><th scope="col">Temp. °C</th><th scope="col">O₂ mg/L</th>'
            '<th scope="col">Water</th></tr></thead>')
    body = ''.join('<tr>' + ''.join((f'<th scope="row">{v}</th>' if i == 0 else f'<td>{v}</td>')
                                     for i,v in enumerate(row)) + '</tr>' for row in rows)
    title = "Reference readings" if detail else "Station readings"
    grid = panel(heading(title, "20 Nov · PST") +
                 '<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable measurement rows">'
                 '<table class="data-table">' + head + '<tbody>' + body + '</tbody></table></div>')
    if detail:
        return grid + panel(heading("Bottle record", "AR–184") + details([
            ("Depth", "0.35 m below surface"), ("Instrument", "Optical probe · DO–07"),
            ("Calibration", "Before first cast, 07:45")]))
    return grid + '<p class="caption">Ten spot readings. Temperature and dissolved oxygen are recorded at bottle depth.</p>'


def days(itinerary):
    badge = ('<div class="date-banner"><div class="date-badge"><span class="day-number">24</span>'
             '<span>Nov</span></div><div><strong>Tuesday, 24 November</strong>'
             '<p class="small muted">First light 07:24 · Low tide 09:06</p></div></div>')
    if itinerary:
        visits = [
            ("07:30", "Depart station", "Meet at the boathouse with the calibrated probe."),
            ("08:15", "Alder Reach", "Read the staff gauge and collect two samples."),
            ("10:40", "North meadow", "Photograph quadrats B through E."),
        ]
        return badge + panel(heading("Day itinerary", "Local time") + '<ol class="visits">' +
            ''.join(f'<li><time>{t}</time><div><b>{title}</b><p>{desc}</p></div></li>'
                    for t,title,desc in visits) + '</ol>') + '<p class="caption">Return before the 13:40 channel closure.</p>'
    schedule = {3:"Census", 10:"Salinity", 17:"Census", 20:"Gauges", 24:"Transect", 27:"Gauges"}
    dates = []
    for day in range(1, 36):
        if day <= 30:
            cls = ' class="selected-day"' if day == 24 else ''
            entry = f'<span class="cal-event">{schedule[day]}</span>' if day in schedule else ""
            dates.append(f'<td{cls}><span>{day}</span>{entry}</td>')
        else:
            dates.append('<td class="other-month"></td>')
    weeks = ''.join('<tr>' + ''.join(dates[i:i+7]) + '</tr>' for i in range(0,35,7))
    return badge + panel('<table class="month"><caption>November 2026</caption><thead><tr>' +
        ''.join(f'<th scope="col">{day}</th>' for day in ('Sun','Mon','Tue','Wed','Thu','Fri','Sat')) +
        '</tr></thead><tbody>' + weeks + '</tbody></table>') + '<p class="caption">Station visits follow Pacific time.</p>'


def identity():
    return ('<div class="identity"><span class="person-avatar" aria-hidden="true">LH</span>'
            '<div class="person-text"><span class="person-name">Lina Haddad</span>'
            '<span class="small muted">Field coordinator</span></div></div>')


def people(member):
    if member:
        return panel(heading("Staff record", "LH · 04") + identity() +
            '<div class="profile-tools">' + link("team", "Team directory", ' data-visual="focus"') +
            '<span class="small muted">North Coast</span></div>') + panel(
            heading("Bilingual station instructions", "ar / en") +
            '<div class="parallel-text"><div lang="ar" dir="rtl"><h3>ملاحظات المحطة</h3>'
            '<p>سجّل مستوى الماء عند الوصول إلى الموقع <bdi>AR–02</bdi>. ضع رقم العينة في أعلى الصفحة.</p></div>'
            '<div><h3>Station notes</h3><p>Read the water level on arrival at AR–02. Place the sample number '
            'at the top of the page.</p></div></div>')
    roster = ''.join(f'<div class="identity"><span class="avatar-alt">{initial}</span>'
                     f'<div class="person-text"><strong>{name}</strong><span class="small muted">{role}</span>'
                     '</div></div>' for initial, name, role in [
                         ("JR", "Jules Reyes", "Station botanist"), ("MC", "Mei Chen", "Water quality"),
                         ("AŠ", "Anja Šimůnková", "Estuary partnership")])
    return panel(heading("North Coast", "4 contributors") + identity() + roster) + panel(
        heading("Visiting researcher") + '<div class="panel-pad"><span lang="de">'
        'Forschungsverbund Küstenfeuchtgebiete</span><p class="small muted">'
        'Seasonal liaison · Berlin, Germany</p></div>')


def events(notices):
    rows = ([("08:42", "A note needs a second reading", "Jules flagged stake B in Meadow survey."),
             ("08:16", "Import is ready to review", "Two source rows share a sample identifier."),
             ("Yesterday", "Roster updated", "Anja joined the estuary partnership.")]
            if notices else
            [("08:42", "Meadow survey revised", "Jules added the second transect photograph."),
             ("08:16", "New observations imported", "Mei added eight station readings."),
             ("Yesterday", "Collection renamed", "Lina changed “Sedge beds” to “Sedge plots”.")])
    content = ''
    for i, (time,title,desc) in enumerate(rows):
        marker = 'event-dot' if i == 0 else 'dot'
        content += (f'<li><i class="{marker}" aria-hidden="true"></i><div><time>{time}</time>'
                    f'<b>{title}</b><p>{desc}</p></div></li>')
    result = panel(heading("Unread updates" if notices else "Recent changes", "Station time") +
                   '<ol class="event-list">' + content + '</ol>')
    if notices:
        result += panel(heading("Delivery") + details([("Daily digest", "07:00 PST"), ("Urgent notices", "At arrival")]))
    else:
        result += '<p class="caption">Edits link to the station notebook under which they were recorded.</p>'
    return result


def fields(new):
    first = ('<div class="field-group"><label for="first-field">' + ('Record title' if new else 'Default author') +
             '</label><input id="first-field" value="' + ('Meadow return' if new else 'Jules Reyes') +
             '" readonly aria-describedby="first-help"><span class="field-hint" id="first-help">' +
             ('Use the title from the paper notebook.' if new else 'Appears on newly transcribed notes.') + '</span></div>')
    if new:
        contents = (first + '<div class="form-field"><label for="station-code">Station code</label>'
                    '<input id="station-code" value="AR-2" aria-invalid="true" aria-describedby="code-error" readonly>'
                    '<span class="error" id="code-error">Use the two-digit station code, such as AR–02.</span></div>'
                    '<div class="form-field"><label for="observation-text">Observation</label>'
                    '<textarea id="observation-text" readonly aria-invalid="true" aria-describedby="obs-error"></textarea>'
                    '<span class="error" id="obs-error">Add an observation before review.</span></div>')
    else:
        contents = (first + '<div class="form-field"><label for="units">Measurement units</label>'
                    '<input id="units" value="Metric (cm, °C, mg/L)" readonly></div>'
                    '<div class="form-field"><label for="locale">Transcription locale</label>'
                    '<input id="locale" lang="de" value="Deutsch (Deutschland)" readonly>'
                    '<span class="small muted" lang="de">Datumsformat: 24. November 2026</span></div>')
    return panel(heading("Notebook entry" if new else "Transcription", "Required fields" if new else "Workspace defaults") +
                 '<form class="form-stack">' + contents + '</form>')


def action_foot(dest, label):
    return ('<div class="panel-foot"><span>Read-only preview</span>' +
            link(dest, label, ' class="foot-action"') + '</div>')


def review_imports(imports):
    if imports:
        token = "northcoast-2026-11-24/AlderReach-calibration-bottle-AR02-184"
        card = panel(heading("Source identifier", "Required") + '<div class="import-id">'
            f'<code data-visual="clip">{token}</code></div>' + action_foot("review", "Review batch"))
        drawer = ('<div class="overlay-stage drawer-stage"><div class="underlay" aria-hidden="true">'
                  '<span>Intake queue</span><div></div><div></div><div></div></div>'
                  '<section class="drawer" aria-label="Import progress"><div class="drawer-grip"></div>'
                  '<h3>Reading source file</h3><p>12 of 18 rows validated</p>'
                  '<progress max="18" value="12">67%</progress><div class="skeleton-line"></div>'
                  '<div class="skeleton-line short"></div></section></div>')
        return card + panel(heading("Import progress", "Pending") + drawer)
    card = panel(heading("Pending submission", "1 of 3") +
        '<div class="review-summary"><b>North meadow transect</b>'
        '<p>Three observations and one reference photograph.</p></div>' + action_foot("record", "Read note"))
    dialog = ('<div class="overlay-stage"><div class="underlay" aria-hidden="true">'
              '<span>Field queue</span><div></div><div></div></div><section class="dialog" role="dialog" '
              'aria-labelledby="review-title"><h3 id="review-title">Review field note</h3>'
              '<p>The reported station differs from the imported station. Which value belongs in the journal?</p>'
              '<dl class="mini-facts"><div><dt>Notebook</dt><dd>NM–04</dd></div>'
              '<div><dt>Import</dt><dd>NM–40</dd></div></dl></section></div>')
    return card + panel(heading("Station conflict", "Review preview") + dialog)


def search_detail_extras():
    # Local split pane, an intentionally shortened attachment, and a static annotation popover.
    return panel(heading("Attachment comparison", "Original / transcription") +
        '<div class="split-pane"><section><h3>Notebook scan</h3><p data-visual="ellipsis" '
        'title="NC-2026-November-transect-B-western-meadow-quadrat-reference-photographs.tif">'
        'NC-2026-November-transect-B-western-meadow-quadrat-reference-photographs.tif</p>'
        '<p class="small muted">Page 42 · 600 dpi</p></section>'
        '<section><h3>Transcription</h3><p>Water reached the lower edge of the sedge plot.</p>'
        '<div class="annotation"><span class="annotation-anchor">Stake B</span><aside class="annotation-card">'
        '<b>Margin note</b><p>Marker replaced after spring runoff.</p></aside></div></section></div>')


def main():
    bodies = {
        "inbox": inbox_archive(False), "archive": inbox_archive(True),
        "record": record() + search_detail_extras(), "settings": settings(),
        "collections": tree(False), "collection-detail": tree(True),
        "search": search(False), "search-empty": search(True), "tags": tags(False), "tag-detail": tags(True),
        "sites": station_chart(False), "site-detail": station_chart(True),
        "observations": observations(False), "observation-detail": observations(True),
        "calendar": days(False), "itinerary": days(True), "team": people(False), "member": people(True),
        "activity": events(False), "notifications": events(True), "preferences": fields(False),
        "new-note": fields(True), "review": review_imports(False), "imports": review_imports(True),
    }
    assert set(bodies) == set(NAMES)
    for page, name, context, status in PAGES:
        (OUT / url(page)).write_text(layout(page, name, context, status, bodies[page]), encoding="utf-8")


if __name__ == "__main__":
    main()
