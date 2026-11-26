"""Shared styles for marks drawn over clean audit evidence."""
from functools import lru_cache
from pathlib import Path
import re

from PIL import ImageFont


CSS = (Path(__file__).resolve().parents[1] / "assets/proof-style.css").read_text()
COLORS = dict(re.findall(r"--ee-([a-z]+): (#[0-9a-f]{6});", CSS))
# Lengths in displayed pixels. A zero gap is a solid line.
PATTERNS = {"reference": (6, 4), "observed": (1, 0), "grid": (1, 4)}


@lru_cache(maxsize=64)
def font(size):
    for face in ("Helvetica.ttc", "Helvetica.ttf", "NimbusSans-Regular.otf", "Arial.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(face, size)
        except OSError:
            continue
    return ImageFont.load_default()


def rail(draw, axis, position, start, end, role, scale=1, color=None, keyline=True, backdrop=None):
    """Paint one axis-aligned rail; keep the gaps between dashes transparent."""
    dash, gap = PATTERNS[role]
    width = max(1, round(scale))
    dash, gap = max(1, round(dash * scale)), max(0, round(gap * scale))
    # Sample a solid rail in short sections on a mixed light/dark screenshot.
    step = max(1, end - start + 1)
    if gap:
        step = dash + gap
    elif backdrop is not None:
        step = max(1, round(8 * scale))
    for a in range(start, end + 1, step):
        b = min(end, a + (dash if gap else step) - 1)
        segment = (position, a, position, b) if axis == "x" else (a, position, b, position)
        middle = (a + b) // 2
        point = (position, middle) if axis == "x" else (middle, position)
        needs_casing = keyline if backdrop is None else backdrop.getpixel(point) < 168
        if needs_casing and role != "grid":
            draw.line(segment, fill=COLORS["paper"], width=width + 2 * width)
        draw.line(segment, fill=color or COLORS[role], width=width)
