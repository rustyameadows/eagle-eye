"""Exact source, class maps, regions and safe reuse for full-raster proofs."""
import base64
import importlib.util
import json
from pathlib import Path
import re
import struct
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pixelproof', ROOT / 'skills/eagle-eye/scripts/pixel-proof.py')
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class PixelProofTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.src = self.root / 'manifest.json'
        self.output = self.root / 'presentation'
        self.data = {'title': 'Display <&> </script>', 'stages': [{'id': k, 'label': k} for k in ('a', 'b', 'c')],
                     'profiles': [{'id': 'wide', 'label': 'Wide', 'scale': 2, 'origin': {'x': 12.5, 'y': 0},
                                   'images': {k: k+'.png' for k in ('a', 'b', 'c')},
                                   'regions': [{'label': 'End', 'x': 1, 'y': 0, 'width': 2, 'height': 1}]}]}
        self.a = Image.new('RGB', (3, 2), (115, 35, 20))
        self.b = self.a.copy()
        self.b.putpixel((1, 0), (2, 59, 115))  # Equal weighted intensity at a different RGB color.
        self.b.putpixel((2, 0), (114, 35, 20))  # A one-byte channel difference counts.
        self.b.putpixel((0, 1), (115, 36, 20))
        self.a.save(self.root / 'a.png')
        self.b.save(self.root / 'b.png')
        self.b.save(self.root / 'c.png')

    def build(self):
        self.src.write_text(json.dumps(self.data))
        proof.build(self.src, self.output)

    def test_full_population_map_and_coordinates(self):
        self.build()
        profile = json.loads((self.output / 'measurements.json').read_text())['profiles'][0]
        self.assertEqual((profile['width'], profile['height'], profile['scale']), (3, 2, 2))
        self.assertEqual(len(profile['comparisons']), 3)
        ab = profile['comparisons'][0]
        self.assertEqual(ab['counts'], dict(total=6, unchanged=3, changed=3, darker=1, lighter=1, equalBrightness=1))
        self.assertEqual(ab['changedBounds'], [0, 0, 3, 2])
        self.assertEqual(ab['maxChannelDeltaHistogram'][0], 3)
        self.assertEqual(ab['maxChannelDeltaHistogram'][1], 2)
        self.assertEqual(ab['peakChannelDelta'], 113)
        self.assertEqual(sum(ab['maxChannelDeltaHistogram']), 6)
        self.assertEqual(ab['regions'][0]['counts'], dict(total=2, unchanged=0, changed=2, darker=1, lighter=0, equalBrightness=1))
        with Image.open(self.output / ab['map']) as image:
            self.assertEqual(image.getpixel((1, 0)), 3)
            self.assertEqual(image.convert('RGB').getpixel((2, 0)), proof.PALETTE[1])
        bc = profile['comparisons'][-1]
        self.assertIsNone(bc['changedBounds'])
        self.assertEqual(bc['counts']['unchanged'], 6)
        self.assertEqual((self.output / profile['images']['a']['file']).read_bytes(), (self.root / 'a.png').read_bytes())

    def test_embedded_raster_round_trips_including_long_runs(self):
        self.build()
        html = (self.output / 'index.html').read_text()
        encoded = re.search('<script type="application/json" id="pixel-data">(.*?)</script>', html).group(1)
        data = json.loads(encoded)
        self.assertEqual(data['report']['title'], self.data['title'])
        self.assertNotIn('<', encoded)
        long = Image.new('RGB', (300, 240), (255, 254, 65))
        for im, packed in [(self.a, data['pixels']['wide']['a']), (self.b, data['pixels']['wide']['b']),
                           (long, proof.pack_rgb(long))]:
            runs = struct.iter_unpack('>HBBB', base64.b64decode(packed))
            decoded = b''.join(bytes((r, g, b))*n for n, r, g, b in runs)
            self.assertEqual(decoded, im.tobytes())

    def test_invalid_capture_leaves_no_partial_proof(self):
        Image.new('RGBA', self.a.size, (0, 0, 0, 1)).save(self.root / 'a.png')
        with self.assertRaisesRegex(ValueError, 'opaque backdrop'):
            self.build()
        self.assertFalse(self.output.exists())
        Image.new('RGB', (1, 1)).save(self.root / 'a.png')
        with self.assertRaisesRegex(ValueError, 'dimensions differ'):
            self.build()
        self.assertFalse(self.output.exists())
        self.a.save(self.root / 'a.png')
        self.build()
        with self.assertRaisesRegex(ValueError, 'new output directory'):
            self.build()


if __name__ == '__main__':
    unittest.main()
