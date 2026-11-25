"""Mark up a copy of a screenshot and measure selected ink against named guides."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFont


PALETTE = ["#08754c", "#a1376d", "#2d61b1", "#925116"]


def number(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ValueError(f"Expected a finite coordinate, got {value!r}")
    return value


def rect(box, scale, size):
    if len(box) != 4:
        raise ValueError("Use [left, top, right, bottom] for rectangles")
    left, top, right, bottom = [round(number(v) * scale) for v in box]
    if not (0 <= left < right <= size[0] and 0 <= top < bottom <= size[1]):
        raise ValueError(f"Empty or out-of-image rectangle: {box}")
    return left, top, right, bottom


def measure(image, box, ink, tolerance):
    if not isinstance(tolerance, int) or not 0 <= tolerance <= 255:
        raise ValueError("RGB tolerance must be an integer from 0 to 255")
    patch = image.crop(box)
    target = Image.new("RGB", patch.size, ImageColor.getrgb(ink))
    channels = ImageChops.difference(patch, target).split()
    distance = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
    mask = distance.point(lambda d: 255 if d <= tolerance else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError(f"No ink matching {ink} in source-pixel rectangle {box}")
    left, top, right, bottom = bounds
    touches_edge = left == 0 or top == 0 or right == patch.width or bottom == patch.height
    return (left + box[0], top + box[1], right + box[0], bottom + box[1]), touches_edge


def annotate(source, recipe):
    scale = number(recipe["scale"])
    if scale <= 0:
        raise ValueError("Scale must be positive")
    units = recipe.get("units", "css-px")
    if units not in ("css-px", "image-px") or (units == "image-px" and scale != 1):
        raise ValueError("Use css-px, or use image-px with scale 1 for an uncalibrated screenshot")
    unit_label = "CSS px" if units == "css-px" else "image px"
    unit_key = units.replace("-", "_")
    with Image.open(source) as original:
        image = original.convert("RGB")
    crop = rect(recipe["crop"], scale, image.size) if "crop" in recipe else (0, 0, *image.size)
    detail = image.crop(crop)
    draw = ImageDraw.Draw(detail)
    guides, legend, results = {}, [], []
    stroke = max(1, round(scale))
    for i, guide in enumerate(recipe["guides"]):
        name, axis, at = guide["name"], guide["axis"], number(guide["at"])
        if name in guides or axis not in ("x", "y"):
            raise ValueError(f"Guide needs a unique name and x/y axis: {name}")
        color = guide.get("color", PALETTE[i % len(PALETTE)])
        index = 0 if axis == "x" else 1
        pos = round(at * scale) - crop[index]
        if not 0 <= pos < detail.size[index]:
            raise ValueError(f"Guide {name} is outside the displayed crop")
        line = (pos, 0, pos, detail.height - 1) if axis == "x" else (0, pos, detail.width - 1, pos)
        draw.line(line, fill=color, width=stroke)
        guides[name] = (axis, at, color)
        legend.append((color, f"{name}   |   {axis} = {at:g} {unit_label}"))
    if not guides:
        raise ValueError("Specify at least one guide")
    for region in recipe.get("regions", []):
        axis, at, color = guides[region["guide"]]
        box = rect(region["box"], scale, image.size)
        if box[0] < crop[0] or box[1] < crop[1] or box[2] > crop[2] or box[3] > crop[3]:
            raise ValueError(f"Region outside displayed crop: {region['name']}")
        bounds, touches = measure(image, box, region["ink"], region.get("tolerance", 24))
        index = 0 if axis == "x" else 1
        lo, hi = bounds[index] / scale, bounds[index + 2] / scale
        anchor = region.get("anchor", "center")
        value = {"start": lo, "center": (lo + hi) / 2, "end": hi}[anchor]
        delta = value - at
        draw.rectangle((bounds[0]-crop[0], bounds[1]-crop[1], bounds[2]-crop[0]-1, bounds[3]-crop[1]-1),
                       outline=color, width=stroke)
        legend.append((color, f"{region['name']}   |   {anchor} {delta:+g} {unit_label}" + ("   [check crop edge]" if touches else "")))
        results.append({
            "name": region["name"], "guide": region["guide"], "anchor": anchor,
            "ink_bounds_px": bounds, f"position_{unit_key}": value, f"offset_{unit_key}": delta,
            "touches_roi_edge": touches,
        })
    for face in ("Helvetica.ttc", "Helvetica.ttf", "NimbusSans-Regular.otf", "Arial.ttf"):
        try:
            font = ImageFont.truetype(face, 13)
            break
        except OSError:
            continue
    else:
        font = ImageFont.load_default()
    row_height = 20
    width = max(detail.width, max(math.ceil(draw.textlength(text, font=font)) for _, text in legend) + 28)
    canvas = Image.new("RGB", (width, detail.height + 12 + row_height * len(legend)), "#ffffff")
    canvas.paste(detail)
    draw = ImageDraw.Draw(canvas)
    for i, (color, label) in enumerate(legend):
        y = detail.height + 6 + i * row_height
        draw.rectangle((6, y+4, 14, y+7), fill=color)
        draw.text((20, y), label, fill="#222222", font=font)
    return canvas, dict(scale=scale, units=units, source_size_px=image.size, crop_px=crop, measurements=results)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("recipe", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        recipe = json.loads(args.recipe.read_text())
        canvas, results = annotate(args.source, recipe)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("xb") as stream:
            canvas.save(stream, "PNG")
        print(json.dumps(results, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"Guide capture failed: {error}\n")


if __name__ == "__main__":
    main()
