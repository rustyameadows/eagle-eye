"""Check the marks themselves on both densities, including the spaces between them."""
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageColor

SCRIPTS = Path(__file__).resolve().parents[1] / "skills/eagle-eye/scripts"
sys.path.insert(0, str(SCRIPTS))
from guides import annotate
from proof_style import COLORS


class GuideStyleTest(unittest.TestCase):
    def test_roles_and_measurements_survive_dark_paint_and_density(self):
        with tempfile.TemporaryDirectory() as tmp:
            for scale in (1, 2):
                source = Path(tmp) / f"capture-{scale}.png"
                im = Image.new("RGB", (80*scale, 50*scale), "#303030")
                im.paste("#f6f6f6", (0, 30*scale, 80*scale, 50*scale))
                im.paste("#888888", (24*scale, 15*scale, 32*scale, 25*scale))
                im.save(source)
                original = source.read_bytes()
                recipe = {"scale": scale, "guides": [
                    {"name": "Inset", "axis": "x", "at": 20},
                    {"name": "Grid", "axis": "x", "at": 45, "role": "grid"},
                    {"name": "Edge", "axis": "x", "at": 60, "role": "observed"}],
                    "regions": [{"name": "Marker", "box": [22,13,34,27], "guide": "Inset",
                                 "ink": "#888888", "tolerance": 0, "anchor": "start"}]}
                out, data = annotate(source, recipe)
                self.assertEqual(source.read_bytes(), original)
                self.assertEqual(data["measurements"][0]["offset_css_px"], 4)
                for x, y, expected in [(20,0,"reference"),(20,5,"reference"),(20,8,"#303030"),
                                       (45,0,"grid"),(45,2,"#303030"),(60,8,"observed"),
                                       (24,19,"observed"),(19,2,"paper"),(19,42,"#f6f6f6")]:
                    self.assertEqual(out.getpixel((x*scale,y*scale)), ImageColor.getrgb(COLORS.get(expected, expected)))
                # Between legend samples and values, letter antialiasing stays neutral.
                legend = out.crop((42*scale, out.height - 3*26*scale, out.width, out.height))
                colors = {rgb for _, rgb in legend.getcolors(legend.width*legend.height)}
                self.assertIn(ImageColor.getrgb(COLORS["ink"]), colors)
                self.assertTrue(all(r == g == b for r,g,b in colors))
                recipe["guides"][0]["color"] = "#123456"
                custom, _ = annotate(source, recipe)
                self.assertEqual(custom.getpixel((20*scale, 0)), (18, 52, 86))
                recipe["guides"][0]["role"] = "typo"
                with self.assertRaisesRegex(ValueError, "Unknown guide role"):
                    annotate(source, recipe)


if __name__ == "__main__":
    unittest.main()
