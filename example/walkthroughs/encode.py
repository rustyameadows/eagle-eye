"""Encode deterministic Stageshow frames with one palette for the whole loop."""
from pathlib import Path
import sys
import argparse

from PIL import Image, ImageChops, ImageColor

OUT = Path(__file__).resolve().parent
PERIOD_MS = 10800


sys.path.insert(0, str(OUT.parents[1] / "skills/eagle-eye/scripts"))
from proof_style import COLORS


def indexed_frames(frames):
    # Keep every neutral annotation neutral, and reserve exact semantic inks even
    # when a one-pixel stroke occupies too little area for adaptive quantization.
    grays = [(round(i * 255 / 79),) * 3 for i in range(80)]
    inks = [ImageColor.getrgb(COLORS[key]) for key in ("reference", "observed", "distance", "index", "grid")]
    accents = [tuple(round(channel + (255-channel)*level/8) for channel in ink)
               for ink in inks for level in range(8)]
    samples = Image.new("RGB", (320, 128 * len(frames)))
    for i, frame in enumerate(frames):
        samples.paste(frame.resize((320, 128), Image.Resampling.NEAREST), (0, 128*i))
    count = 256 - len(grays) - len(accents)
    sampled = samples.quantize(colors=count).getpalette()[:count * 3]
    entries = [v for rgb in grays + accents for v in rgb] + sampled
    palette = Image.new("P", (1, 1))
    palette.putpalette(entries + [0] * (768-len(entries)))
    lookup = [round(v * 79 / 255) for v in range(256)]
    result = []
    for frame in frames:
        out = frame.quantize(palette=palette, dither=Image.Dither.NONE)
        r, g, b = frame.split()
        neutral = ImageChops.lighter(ImageChops.difference(r, g), ImageChops.difference(g, b)).point(
            lambda v: 0 if v else 255)
        gray = r.point(lookup)
        gray.putpalette(palette.getpalette())
        out.paste(gray, mask=neutral)
        result.append(out)
    return result


def encode(directory):
    paths = sorted(directory.glob("*.png"), key=lambda path: int(path.stem))
    times = [int(path.stem) for path in paths]
    assert times[0] == 0 and times[-1] < PERIOD_MS
    subject, _, size = directory.name.rpartition("-")
    frames = []
    for path in paths:
        with Image.open(path) as shot:
            frames.append(shot.convert("RGB"))
    durations = [stop - start for start, stop in zip(times, times[1:] + [PERIOD_MS])]
    indexed = indexed_frames(frames)
    indexed[0].save(OUT / (directory.name + ".gif"), save_all=True, append_images=indexed[1:],
                    duration=durations, loop=0, optimize=True, disposal=1)
    if size == "wide":
        beats = (1400, 7200) if subject == "example-1" else (3200, 7200)
        still = Image.new("RGB", (744, 606), "#dddddd")
        for y, beat in zip((0, 304), beats):
            still.paste(frames[times.index(beat)], (0, y))
        still.save(OUT / (subject + "-comparison.png"), optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path)
    parser.add_argument("subjects", nargs="+")
    parser.add_argument("--formats", nargs="+", choices=("wide", "compact", "square"),
                        default=("wide", "compact"))
    args = parser.parse_args()
    for subject in args.subjects:
        for size in args.formats:
            encode(args.frames / f"{subject}-{size}")
