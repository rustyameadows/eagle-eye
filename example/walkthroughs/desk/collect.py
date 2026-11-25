"""Collect the audited frames and the coordinates used by the README walkthroughs."""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent


def collect(view_run, type_run):
    views = json.loads((view_run / 'report.json').read_text())
    headings = json.loads((type_run / 'report.json').read_text())
    nav = {}
    pairs = {}
    previous_boundaries = None
    for route in ('library', 'notes', 'fixed-notes', 'type-retest'):
        capture = views['captures']['phone'][route]
        image = view_run / capture['file']
        with Image.open(image) as shot:
            assert shot.size == (780, 720)
            if route != 'type-retest':
                box = capture['anchors']['nav-icon']['box']
                nav[route] = box['left']
                # Sample the solid spine of the book icon at its vertical midpoint.
                y = int(box['top'] + box['bottom'])
                first = next(x for x in range(100) if max(shot.getpixel((x, y))[:3]) < 100)
                assert first == nav[route] * 2
            if route in ('fixed-notes', 'type-retest'):
                inspected = headings['captures']['phone'][route]
                h, = inspected['headings']
                with Image.open(type_run / inspected['file']) as check:
                    assert ImageChops.difference(shot.convert('RGB'), check.convert('RGB')).getbbox() is None
                assert len(h['lines']) == 1 and h['accessibility']['name'] == 'Paper trail'
                boundaries = h['proof']['boundaries']
                assert len(boundaries) == 10 and boundaries[0]['word'] == 'Paper'
                boundary = boundaries[0]
                assert (boundary['left'], boundary['right']) == ('P', 'a')
                clearance = boundary['columnClearance']
                pairs[route] = {'left': clearance['x1'], 'right': clearance['x2'],
                                'gap': clearance['cssPx'], 'pairEnd': boundary['boxes'][1]['x'] + boundary['boxes'][1]['width']}
                # The rest of the word and line keep their relative spacing.
                remaining = [(b.get('columnClearance') or {}).get('cssPx') for b in boundaries[1:]]
                assert previous_boundaries is None or remaining == previous_boundaries
                previous_boundaries = remaining
        shutil.copyfile(image, HERE / 'evidence' / (route + '.png'))
    assert nav['library'] == nav['fixed-notes'] and nav['notes'] > nav['library']
    assert pairs['fixed-notes']['gap'] > pairs['type-retest']['gap']
    (HERE / 'measurements.json').write_text(json.dumps({'nav': nav, 'pair': pairs}, indent=2) + '\n')


if __name__ == '__main__':
    collect(Path(sys.argv[1]), Path(sys.argv[2]))
