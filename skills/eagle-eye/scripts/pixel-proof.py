"""Build an offline pixel viewer for registered, opaque 8-bit PNG captures."""
import argparse
import base64
import hashlib
from itertools import combinations, groupby
import json
import math
from pathlib import Path
import re
import shutil
import struct
import tempfile

from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / 'assets'
CLASSES = ('unchanged', 'darker', 'lighter', 'equalBrightness')
PALETTE = [
    (235, 237, 232),  # unchanged
    (35, 91, 161),   # darker in the second capture
    (219, 123, 48),  # lighter in the second capture
    (147, 65, 135),  # changed RGB at equal weighted brightness
]


def named_records(records, minimum, description):
    if not isinstance(records, list) or len(records) < minimum:
        raise ValueError(f'Expected at least {minimum} {description}.')
    ids = set()
    for record in records:
        if not isinstance(record, dict):
            raise ValueError(f'Expected named {description}.')
        name = record.get('id')
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', name) or name in ids:
            raise ValueError(f'Expected unique file-safe IDs for {description}.')
        ids.add(name)
        if not isinstance(record.get('label'), str) or not record['label'].strip():
            raise ValueError(f'Expected readable label for {name}.')


def finite_number(value):
    return type(value) in (float, int) and math.isfinite(value)


def validate_regions(regions, width, height):
    if not isinstance(regions, list):
        raise ValueError('Expected a list of regions.')
    for region in regions:
        if not isinstance(region, dict) or not isinstance(region.get('label'), str) or not region['label']:
            raise ValueError('Each region needs a label.')
        x, y, w, h = [region.get(k) for k in ('x', 'y', 'width', 'height')]
        if not all(type(n) is int for n in (x, y, w, h)) or min(x, y) < 0 or min(w, h) < 1:
            raise ValueError('Region bounds must be integer raster coordinates with a positive size.')
        if x + w > width or y + h > height:
            raise ValueError(f'Region {region["label"]} extends outside the frame.')


def rgb_image(path):
    # Reject a 16-bit source explicitly: Pillow may decode an RGB16 PNG into RGB8.
    with path.open('rb') as stream:
        header = stream.read(26)
    if len(header) < 26 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[24] != 8:
        raise ValueError(f'Expected an 8-bit PNG at {path}.')
    with Image.open(path) as image:
        if getattr(image, 'n_frames', 1) != 1:
            raise ValueError(f'Expected a single frame at {path}.')
        rgba = image.convert('RGBA')
        if rgba.getchannel('A').getextrema() != (255, 255):
            raise ValueError(f'Composite transparency onto a shared opaque backdrop first: {path}.')
        return rgba.convert('RGB')


def pack_rgb(image):
    """RLE in raster order, each run stored as a big-endian uint16 length and 3 RGB bytes."""
    payload = bytearray()
    for color, run in groupby(struct.iter_unpack('BBB', image.tobytes())):
        length = sum(1 for _ in run)
        while length:
            part = min(length, 65535)
            payload.extend(part.to_bytes(2, 'big'))
            payload.extend(color)
            length -= part
    return base64.b64encode(payload).decode('ascii')


def count_map(mask):
    hist = mask.histogram()
    result = dict(zip(CLASSES, hist[:4]))
    result['total'] = mask.width * mask.height
    result['changed'] = result['total'] - result['unchanged']
    return result


def compare(a, b, regions):
    if a.size != b.size:
        raise ValueError('Every stage of a profile must have the same native frame dimensions.')
    mask = bytearray(a.width * a.height)
    deltas = [0] * 256
    rgb_pairs = zip(struct.iter_unpack('BBB', a.tobytes()), struct.iter_unpack('BBB', b.tobytes()))
    for index, (left, right) in enumerate(rgb_pairs):
        if left == right:
            deltas[0] += 1
            continue
        dr, dg, db = (right[0] - left[0], right[1] - left[1], right[2] - left[2])
        level = 2126 * dr + 7152 * dg + 722 * db
        mask[index] = 1 if level < 0 else 2 if level > 0 else 3
        deltas[max(abs(dr), abs(dg), abs(db))] += 1
    classes = Image.frombytes('L', a.size, bytes(mask))
    summaries = []
    for region in regions:
        x, y, w, h = [region[k] for k in ('x', 'y', 'width', 'height')]
        summaries.append({**region, 'counts': count_map(classes.crop((x, y, x + w, y + h)))})
    stats = {'counts': count_map(classes), 'changedBounds': classes.getbbox(),
             'peakChannelDelta': max(i for i, n in enumerate(deltas) if n),
             'maxChannelDeltaHistogram': deltas, 'regions': summaries}
    classes.putpalette(bytes(channel for color in PALETTE for channel in color))
    return stats, classes


def build(manifest_path, output):
    spec = json.loads(manifest_path.read_text(encoding='utf-8'))
    if not isinstance(spec.get('title'), str) or not spec['title'].strip():
        raise ValueError('Supply a proof title.')
    named_records(spec.get('stages'), 2, 'stages')
    named_records(spec.get('profiles'), 1, 'viewport profiles')
    if output.exists():
        raise ValueError('Choose a new output directory to preserve the earlier evidence.')
    stages = [{k: stage[k] for k in ('id', 'label')} for stage in spec['stages']]
    ids = [stage['id'] for stage in stages]
    result = {'title': spec['title'], 'stages': stages, 'palette': PALETTE,
              'method': 'Exact opaque 8-bit RGB comparison, every pixel. Direction uses the sign of 2126 ΔR + 7152 ΔG + 722 ΔB on encoded channels. Bounds use exclusive right/bottom edges.',
              'profiles': []}
    pixels = {}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as scratch:
        dest = Path(scratch) / 'proof'
        dest.mkdir()
        for profile in spec['profiles']:
            pid, scale = profile['id'], profile.get('scale')
            if not finite_number(scale) or scale <= 0:
                raise ValueError(f'Supply a positive device scale for {pid}.')
            if set(profile.get('images', {})) != set(ids):
                raise ValueError(f'Supply exactly one PNG per stage in profile {pid}.')
            p = {'id': pid, 'label': profile['label'], 'scale': scale, 'images': {}, 'comparisons': []}
            if 'origin' in profile:
                origin = profile['origin']
                if not isinstance(origin, dict) or not all(finite_number(origin.get(k)) for k in ('x', 'y')):
                    raise ValueError('Supply an x/y CSS origin for a shared crop.')
                p['origin'] = {k: origin[k] for k in ('x', 'y')}
            folder = dest / 'rasters' / pid
            folder.mkdir(parents=True)
            frames = {}
            pixels[pid] = {}
            size = None
            for i, stage in enumerate(ids):
                source = manifest_path.parent / profile['images'][stage]
                image = rgb_image(source)
                if size is not None and size != image.size:
                    raise ValueError(f'Native dimensions differ in {pid}. Use one shared crop window.')
                size = image.size
                frames[stage] = image
                filename = folder / f'stage-{i+1}.png'
                # Preserve the exact source artifact and provenance for external re-analysis.
                shutil.copyfile(source, filename)
                p['images'][stage] = {'file': filename.relative_to(dest).as_posix(),
                                      'sha256': hashlib.sha256(filename.read_bytes()).hexdigest()}
                pixels[pid][stage] = pack_rgb(image)
            p['width'], p['height'] = size
            p['regions'] = profile.get('regions', [])
            validate_regions(p['regions'], *size)
            for i, (left, right) in enumerate(combinations(ids, 2)):
                stats, diff = compare(frames[left], frames[right], p['regions'])
                filename = folder / f'difference-{i+1}.png'
                diff.save(filename)
                p['comparisons'].append({'from': left, 'to': right,
                                         'map': filename.relative_to(dest).as_posix(), **stats})
            result['profiles'].append(p)
        (dest / 'measurements.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        page = (ASSETS / 'pixel-proof.html').read_text(encoding='utf-8')
        data = json.dumps({'report': result, 'pixels': pixels}, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c')
        page = page.replace('/*PIXEL_PROOF_JS*/', (ASSETS / 'pixel-proof.js').read_text(encoding='utf-8')).replace('/*PIXEL_PROOF_DATA*/', data)
        (dest / 'index.html').write_text(page, encoding='utf-8')
        dest.rename(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    try:
        build(args.manifest.resolve(), args.output.resolve())
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f'Pixel proof failed: {error}\n')
    print(args.output.resolve() / 'index.html')
