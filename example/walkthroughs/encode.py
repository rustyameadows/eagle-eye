"""Encode deterministic Stageshow frames with one palette for the whole loop."""
from pathlib import Path
import sys

from PIL import Image

OUT = Path(__file__).resolve().parent
PERIOD_MS = 10800


def encode(directory):
    paths = sorted(directory.glob("*.png"), key=lambda path: int(path.stem))
    times = [int(path.stem) for path in paths]
    assert times[0] == 0 and times[-1] < PERIOD_MS
    frames = [Image.open(path).convert("RGB") for path in paths]
    durations = [stop - start for start, stop in zip(times, times[1:] + [PERIOD_MS])]
    # Sample all beats, including the ochre finding and the green retest.
    # One shared palette keeps unchanged ink steady through the guide reveal.
    swatches = Image.new("RGB", (192, 80 * len(frames)))
    for i, frame in enumerate(frames):
        swatches.paste(frame.resize((192, 80), Image.Resampling.LANCZOS), (0, 80*i))
    palette = swatches.quantize(colors=256)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(OUT / (directory.name + ".gif"), save_all=True, append_images=indexed[1:],
                    duration=durations, loop=0, optimize=True, disposal=1)
    if directory.name.endswith("-wide"):
        # Both panels in a single still show the decision without playback.
        subject = directory.name.removesuffix("-wide")
        if subject in ("navigation", "kerning", "rainbow"):
            beats = (1400, 7200) if subject == "rainbow" else (3200, 7200)
            still = Image.new("RGB", (744, 606), "#e5e8df")
            for y, beat in zip((0, 304), beats):
                still.paste(frames[times.index(beat)], (0, y))
            still.save(OUT / (subject + "-comparison.png"), optimize=True)
            return
        panels = [frames[times.index(time)].crop((348, 0, 744, 302)) for time in (3200, 7200)]
        still = Image.new("RGB", (794, 302), "#e5e8df")
        still.paste(panels[0], (0, 0))
        still.paste(panels[1], (398, 0))
        still.save(OUT / (directory.name.split("-")[0] + "-comparison.png"), optimize=True)


if __name__ == "__main__":
    for subject in sys.argv[2:]:
        for size in ("wide", "compact"):
            encode(Path(sys.argv[1]) / f"{subject}-{size}")
