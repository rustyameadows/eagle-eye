"""Encode deterministic Stageshow frames with one palette for the whole loop."""
from pathlib import Path
import json
import sys

from PIL import Image

OUT = Path(__file__).resolve().parent
PERIOD_MS = 10800


def encode(directory):
    paths = sorted(directory.glob("*.png"), key=lambda path: int(path.stem))
    times = [int(path.stem) for path in paths]
    assert times[0] == 0 and times[-1] < PERIOD_MS
    subject, _, size = directory.name.rpartition("-")
    regions = json.loads((directory / "color-regions.json").read_text())
    frames = []
    for path in paths:
        with Image.open(path) as shot:
            frame = shot.convert("L").convert("RGB")
            for box in regions:
                frame.paste(shot.crop(box), box)
            frames.append(frame)
    durations = [stop - start for start, stop in zip(times, times[1:] + [PERIOD_MS])]
    if regions:
        # Reserve 64 true grays for annotations and 192 entries for source colors.
        swatches = Image.new("RGB", (192, 80 * len(frames)))
        for i, frame in enumerate(frames):
            swatches.paste(frame.crop(regions[0]).resize((192, 80)), (0, 80*i))
        colors = swatches.quantize(colors=192).getpalette()[:576]
        colors += [0] * (576 - len(colors))
        grays = [round(i * 255 / 63) for i in range(64)]
        palette = Image.new("P", (1, 1))
        palette.putpalette(colors + [v for gray in grays for v in (gray, gray, gray)])
        lookup = [192 + round(v * 63 / 255) for v in range(256)]
        indexed = []
        for frame in frames:
            output = frame.convert("L").point(lookup)
            output.putpalette(palette.getpalette())
            for box in regions:
                crop = frame.crop(box).quantize(palette=palette, dither=Image.Dither.NONE)
                output.paste(crop, box)
            indexed.append(output)
    else:
        indexed = [frame.convert("L") for frame in frames]
    indexed[0].save(OUT / (directory.name + ".gif"), save_all=True, append_images=indexed[1:],
                    duration=durations, loop=0, optimize=True, disposal=1)
    if size == "wide":
        beats = (1400, 7200) if subject == "example-1" else (3200, 7200)
        still = Image.new("RGB", (744, 606), "#dddddd")
        for y, beat in zip((0, 304), beats):
            still.paste(frames[times.index(beat)], (0, y))
        still.save(OUT / (subject + "-comparison.png"), optimize=True)


if __name__ == "__main__":
    for subject in sys.argv[2:]:
        for size in ("wide", "compact"):
            encode(Path(sys.argv[1]) / f"{subject}-{size}")
