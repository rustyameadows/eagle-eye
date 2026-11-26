"""Mark up a copy of a screenshot and measure selected ink against named guides."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFilter

from proof_style import COLORS, PATTERNS, font, rail


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
    clean = image.crop(crop)
    detail = clean.copy()
    # A white casing against a dark surface keeps the rail visible. On light
    # paper a bare stroke preserves more of the small glyphs underneath it.
    backdrop = clean.convert("L").filter(ImageFilter.BoxBlur(max(1, round(3 * scale))))
    draw = ImageDraw.Draw(detail)
    guides, groups, results = {}, {}, []
    stroke = max(1, round(scale))
    for guide in recipe["guides"]:
        name, axis, at = guide["name"], guide["axis"], number(guide["at"])
        if name in guides or axis not in ("x", "y"):
            raise ValueError(f"Guide needs a unique name and x/y axis: {name}")
        role = guide.get("role", "reference")
        if role not in PATTERNS:
            raise ValueError(f"Unknown guide role: {role}")
        color = guide.get("color", COLORS[role])
        index = 0 if axis == "x" else 1
        pos = round(at * scale) - crop[index]
        if not 0 <= pos < detail.size[index]:
            raise ValueError(f"Guide {name} is outside the displayed crop")
        rail(draw, axis, pos, 0, detail.size[1-index] - 1, role, scale, color, backdrop=backdrop)
        guides[name] = (axis, at)
        groups[name] = [(role, color, name, f"{axis} = {at:g} {unit_label}")]
    if not guides:
        raise ValueError("Specify at least one guide")
    for region in recipe.get("regions", []):
        axis, at = guides[region["guide"]]
        box = rect(region["box"], scale, image.size)
        if box[0] < crop[0] or box[1] < crop[1] or box[2] > crop[2] or box[3] > crop[3]:
            raise ValueError(f"Region outside displayed crop: {region['name']}")
        bounds, touches = measure(image, box, region["ink"], region.get("tolerance", 24))
        index = 0 if axis == "x" else 1
        lo, hi = bounds[index] / scale, bounds[index + 2] / scale
        anchor = region.get("anchor", "center")
        value = {"start": lo, "center": (lo + hi) / 2, "end": hi}[anchor]
        delta = value - at
        x1, y1, x2, y2 = bounds[0]-crop[0], bounds[1]-crop[1], bounds[2]-crop[0]-1, bounds[3]-crop[1]-1
        for axis_id, pos, start, end in (("x", x1, y1, y2), ("x", x2, y1, y2),
                                          ("y", y1, x1, x2), ("y", y2, x1, x2)):
            rail(draw, axis_id, pos, start, end, "observed", scale, backdrop=backdrop)
        offset = f"{delta:+g}" if delta else "0"
        groups[region["guide"]].append(("observed", COLORS["observed"], region["name"],
                       f"{anchor} {offset} {unit_label}" + ("  [check crop edge]" if touches else "")))
        results.append({
            "name": region["name"], "guide": region["guide"], "anchor": anchor,
            "ink_bounds_px": bounds, f"position_{unit_key}": value, f"offset_{unit_key}": delta,
            "touches_roi_edge": touches,
        })
    legend = [item for group in groups.values() for item in group]
    face = font(max(1, round(14 * scale)))
    pad, sample, gap, row = [max(1, round(n * scale)) for n in (12, 22, 8, 26)]
    names = max(math.ceil(draw.textlength(name, font=face)) for _, _, name, _ in legend)
    values = max(math.ceil(draw.textlength(value, font=face)) for _, _, _, value in legend)
    label_x = pad + sample + gap
    width = max(detail.width, label_x + names + 2 * pad + values)
    # A small crop can be narrower than its key. Use that room to show the
    # same pixels unmarked, so a rail crossing a small glyph can be checked.
    paired = width > detail.width
    zoom = max(1, min(3, (width-pad) // (2*detail.width))) if paired else 1
    panel_size = (detail.width * zoom, detail.height * zoom)
    if paired:
        width = max(width, 2 * panel_size[0] + pad)
    legend_top = panel_size[1] + (row if paired else 0)
    canvas = Image.new("RGB", (width, legend_top + 2 * pad + row * len(legend)), COLORS["paper"])
    canvas.paste(detail.resize(panel_size, Image.Resampling.NEAREST), (0, 0))
    draw = ImageDraw.Draw(canvas)
    if paired:
        right = width - panel_size[0]
        canvas.paste(clean.resize(panel_size, Image.Resampling.NEAREST), (right, 0))
        suffix = f" · {zoom}×" if zoom > 1 else ""
        draw.text((0, panel_size[1] + row // 2), "Guides" + suffix, font=face, fill=COLORS["ink"], anchor="lm")
        draw.text((right, panel_size[1] + row // 2), "Original" + suffix, font=face, fill=COLORS["ink"], anchor="lm")
    draw.line((0, legend_top, width-1, legend_top), fill=COLORS["rule"], width=stroke)
    for i, (role, color, name, value) in enumerate(legend):
        y = legend_top + pad + i * row + row // 2
        rail(draw, "y", y, pad, pad+sample-1, role, scale, color, keyline=False)
        draw.text((label_x, y), name, fill=COLORS["ink"], font=face, anchor="lm")
        draw.text((width-pad, y), value, fill=COLORS["ink"], font=face, anchor="rm")
    return canvas, dict(scale=scale, units=units, source_size_px=image.size, crop_px=crop, detail_zoom=zoom, measurements=results)


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
