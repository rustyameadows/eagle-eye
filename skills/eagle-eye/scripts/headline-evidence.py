"""Make native-scale crops and diagnostic copies from the original, already shaped page raster."""
import json
import math
from pathlib import Path
import re
from statistics import median
import sys
import unicodedata

from PIL import Image, ImageDraw

from proof_style import COLORS, font


def bbox(boxes, padding=0):
    boxes = [b for b in boxes if b["width"] > 0 and b["height"] > 0]
    if not boxes:
        return (0, 0, 1, 1)
    return (min(b["x"] for b in boxes)-padding, min(b["y"] for b in boxes)-padding,
            max(b["x"]+b["width"] for b in boxes)+padding, max(b["y"]+b["height"] for b in boxes)+padding)


def rect(box):
    x, y, r, b = box
    return {"x": x, "y": y, "width": r-x, "height": b-y}


def pixels(box, scale):
    return (math.floor(box[0]*scale), math.floor(box[1]*scale),
            math.ceil(box[2]*scale), math.ceil(box[3]*scale))


def save_crop(page, box, scale, dest):
    bounds = pixels(box, scale)
    page.crop(bounds).save(dest)
    return rect(tuple(n/scale for n in bounds))


def grapheme_words(heading):
    words = []
    current = []
    vertical = heading["styles"]["writing-mode"].startswith("vertical")
    axis, extent = ("x", "width") if vertical else ("y", "height")
    for run in heading["runs"]:
        for glyph in run["graphemes"]:
            if glyph["text"].isspace() or not glyph["box"]["width"]:
                if current:
                    words.append(current)
                    current = []
                continue
            if current:
                last = current[-1]["box"]
                box = glyph["box"]
                if abs(box[axis] + box[extent]/2 - (last[axis] + last[extent]/2)) > min(box[extent], last[extent])/2:
                    words.append(current)
                    current = []
            current.append({**glyph, "color": run["styles"]["color"]})
    if current:
        words.append(current)
    return words


def latin(text):
    return bool(text) and all("LATIN" in unicodedata.name(ch, "") or unicodedata.combining(ch) for ch in text)


def ink_patch(page, left, right, scale):
    """Identify a sufficiently flat two-color surface around adjacent range boxes."""
    a, b = left["box"], right["box"]
    if right["color"] != left["color"] or a["x"] >= b["x"]:
        return None
    color = re.fullmatch(r"rgb\((\d+),\s*(\d+),\s*(\d+)\)", left["color"])
    if not color:
        return None
    fg = tuple(map(int, color.groups()))
    limits = pixels(bbox([a, b]), scale)
    patch = page.crop(limits)
    histogram = patch.getcolors(maxcolors=patch.width*patch.height)
    count, bg = max(histogram, key=lambda x: x[0])
    if count < patch.width*patch.height*.28 or sum((f-c)**2 for f,c in zip(fg,bg)) < 1600:
        return None
    vector = tuple(f-c for f,c in zip(fg,bg))
    denominator = sum(k*k for k in vector)
    values = patch.load()
    def ink(x,y):
        return sum((v-c)*k for v,c,k in zip(values[x,y],bg,vector)) >= .50*denominator
    return patch, limits, ink


def read_ink_gap(page, left, right, scale):
    """Sample one representative shared-ink row. Its clearance can differ from other rows."""
    surface = ink_patch(page, left, right, scale)
    if not surface:
        return None
    patch, limits, ink = surface
    a, b = left["box"], right["box"]
    midpoint = round(((a["x"]+a["width"]+b["x"])/2)*scale)-limits[0]
    low = max(0, math.floor((a["x"] + a["width"]*.20)*scale)-limits[0])
    high = min(patch.width-1, math.ceil((b["x"] + b["width"]*.80)*scale)-limits[0])
    midpoint = min(high, max(low, midpoint))
    if low >= high:
        return None
    rows = []
    for y in range(int(patch.height*.16), max(int(patch.height*.16),int(patch.height*.85)), max(1,round(scale))):
        lx = next((x for x in range(midpoint,low-1,-1) if ink(x,y)), None)
        rx = next((x for x in range(midpoint,high+1) if ink(x,y)), None)
        # If the boundary crosses ink, the two strokes cannot be attributed reliably.
        if lx is not None and rx is not None and lx < rx:
            rows.append((rx-lx-1, lx+limits[0], rx+limits[0], y+limits[1]))
    if len(rows) < 3:
        return None
    gap,x1,x2,y = sorted(rows)[len(rows)//2]
    return {"cssPx": round(gap/scale,2), "x1": x1/scale, "x2": x2/scale, "y":y/scale}


def analyze(page, heading, scale):
    size = float(heading["styles"]["font-size"][:-2])
    words = grapheme_words(heading)
    pairs = []
    for glyphs in words:
        word = "".join(g["text"] for g in glyphs)
        for first, second in zip(glyphs, glyphs[1:]):
            pair = {"word":word, "pair":first["text"]+second["text"], "letters":[first,second],
                    "wordGlyphs":glyphs, "ink":None, "advanceGap":None}
            left, right = first["box"],second["box"]
            horizontal = heading["styles"]["writing-mode"] == "horizontal-tb"
            if horizontal and latin(first["text"]) and latin(second["text"]) and left["x"] < right["x"]:
                pair["ink"] = read_ink_gap(page,first,second,scale)
                pair["advanceGap"] = right["x"]-left["x"]-left["width"]
            pairs.append(pair)
    observations = []
    if any(r["styles"]["font-kerning"]=="none" for r in heading["runs"]):
        observations.append({"kind":"font-setting","observation":"Native kerning is disabled on text in this heading. Compare the shaped word with native kerning enabled."})
    if len(heading["fonts"])>1:
        observations.append({"kind":"font-usage","observation":"Several typefaces rendered glyphs. Check their intended script and coverage."})
    samples = [p["ink"]["cssPx"] for p in pairs if p["ink"]]
    center = median(samples) if samples else 0
    deviation = median(abs(s-center) for s in samples) if samples else 0
    for p in pairs:
        amount = p["advanceGap"] or 0
        ink = p["ink"]["cssPx"] - center if p["ink"] and len(samples)>=5 else 0
        # A range gap detects disjoint text runs. Painted whitespace is shape-dependent;
        # only shortlist conspicuous outliers within this same rendered heading.
        p["score"] = max(abs(amount)/max(.06*size,1), abs(ink)/max(.10*size,3*deviation,1))
        if p["score"]<1:
            continue
        if abs(amount)>=max(.06*size,1):
            p["observation"] = f"Adjacent layout range edges differ by {amount:+.2f} CSS px."
        else:
            p["observation"] = f"Sampled inter-stroke space is {p['ink']['cssPx']:.2f} CSS px; the heading median is {center:.2f} CSS px."
    ranked = sorted([p for p in pairs if "observation" in p], key=lambda p:-p["score"])[:3]
    for p in ranked:
        observations.append({"kind":"pair-candidate","word":p["word"],"pair":p["pair"],
                             "observation":p["observation"]+" Check the complete word at reading size."})
    heading["suspects"] = observations
    return words,pairs,ranked


def requested_pair(pairs, word, pair):
    return next((p for p in pairs if (not word or word in p["word"]) and (not pair or p["pair"]==pair)),None)


def column_clearance(page, first, second, scale):
    """Measure a single empty ink-projection interval between the two range centers."""
    surface = ink_patch(page, first, second, scale)
    if not surface:
        return None
    patch, limits, ink = surface
    a, b = first["box"], second["box"]
    # Require painted bounding columns on both sides. Overhangs, shared glyphs,
    # internal discontinuities, and multiple possible gaps may defeat attribution.
    left = max(0, math.floor((a["x"] + a["width"] * .5) * scale) - limits[0])
    right = min(patch.width - 1, math.ceil((b["x"] + b["width"] * .5) * scale) - limits[0])
    painted = [x for x in range(left, right + 1) if any(ink(x, y) for y in range(patch.height))]
    gaps = [(x + 1, nx) for x, nx in zip(painted, painted[1:]) if nx > x + 1]
    if len(gaps) != 1:
        return None
    start, end = gaps[0]
    return {"cssPx": (end - start) / scale,
            "x1": (start + limits[0]) / scale, "x2": (end + limits[0]) / scale}


def boundary_kind(left, right):
    if left.isspace() or right.isspace():
        return "word-space"
    categories = [unicodedata.category(g[0])[0] for g in (left, right)]
    if "P" in categories:
        return "punctuation"
    return "letters" if categories == ["L", "L"] else "other"


def boundary_proof(page, heading, scale, pairs):
    glyphs = [{**g, "color": run["styles"]["color"]} for run in heading["runs"] for g in run["graphemes"]]
    horizontal = heading["styles"]["writing-mode"] == "horizontal-tb"
    vertical = heading["styles"]["writing-mode"].startswith("vertical")
    inside_words = {p["letters"][0]["start"]: p for p in pairs}
    rows = []
    for index, (first, second) in enumerate(zip(glyphs, glyphs[1:]), 1):
        a, b = first["box"], second["box"]
        kind = boundary_kind(first["text"], second["text"])
        pair = inside_words.get(first["start"])
        if pair and pair["letters"][1]["start"] != second["start"]:
            pair = None
        record = {"index": index, "left": first["text"], "right": second["text"],
                  "start": first["start"], "end": second["end"], "kind": kind,
                  "word": pair["word"] if pair else None, "rangeGap": None, "inkSample": None,
                  "columnClearance": None, "boxes": [a, b]}
        axis, extent = ("x", "width") if vertical else ("y", "height")
        separation = abs((a[axis] + a[extent] / 2) - (b[axis] + b[extent] / 2))
        if a[extent] and b[extent] and separation > min(a[extent], b[extent]) / 2:
            method = "line-break"
        elif min(a["height"], a["width"], b["height"], b["width"]) <= 0:
            method = "no-rendered-area"
        elif kind == "word-space":
            method = "word-space"
        elif horizontal and a["x"] < b["x"]:
            # A box edge is independent of glyph ink, even when the ranges coincide.
            record["rangeGap"] = b["x"] - a["x"] - a["width"]
            record["columnClearance"] = column_clearance(page, first, second, scale)
            # The projection works independently of script or proposed cause.
            # Reuse any available shared-row sample from the original analysis.
            record["inkSample"] = pair["ink"] if pair else None
            if record["columnClearance"]:
                method = "column-clearance"
            elif record["inkSample"]:
                method = "ink-sample"
            else:
                method = "visual-only"
        else:
            method = "visual-only"
        record["method"] = method
        rows.append(record)
    return rows


def word_proofs(root, page, heading, scale, words, rows):
    """Retain the full painted word, with guide marks placed in a separate margin."""
    files = []
    by_start = {row["start"]: row for row in rows}
    for ordinal, glyphs in enumerate(words, 1):
        boundaries = [by_start[g["start"]] for g in glyphs[:-1]]
        if not boundaries:
            continue
        text = "".join(g["text"] for g in glyphs)
        bounds = pixels(bbox([g["box"] for g in glyphs], 5), scale)
        native = page.crop(bounds)
        # Nominally enlarge to 3x CSS size. Fit unusually long words to one proof.
        zoom = min(3 / scale, 1400 / native.width, 900 / native.height)
        size = tuple(max(1, round(n * zoom)) for n in native.size)
        enlarged = native.resize(size, Image.Resampling.NEAREST if zoom >= 1 else Image.Resampling.LANCZOS)
        vertical = heading["styles"]["writing-mode"].startswith("vertical")
        frame_w = max(420, enlarged.width + (80 if vertical else 24))
        frame = Image.new("RGB", (frame_w, enlarged.height + 76), COLORS["mat"])
        draw = ImageDraw.Draw(frame)
        header = f'Word {ordinal} · boundaries {boundaries[0]["index"]}–{boundaries[-1]["index"]}'
        draw.text((12, 8), header, font=font(16), fill=COLORS["ink"])
        frame.paste(enlarged, (12, 36))
        # Number the gaps under the photographed word (or beside vertical text).
        # Use the DOM range centers only to locate the boundary, preserving the ink.
        for row in boundaries:
            a, b = row["boxes"]
            axis, dim, origin = ("y", "height", bounds[1]) if vertical else ("x", "width", bounds[0])
            first, second = sorted((a, b), key=lambda v: v[axis])
            at = (first[axis] + first[dim] + second[axis]) / 2
            coord = round((at * scale - origin) * (size[1] / native.height if vertical else size[0] / native.width))
            if vertical:
                pos = (12 + enlarged.width, 36 + coord)
                draw.line((pos[0], pos[1], pos[0] + 4, pos[1]), fill=COLORS["index"])
                draw.text((pos[0] + 6, pos[1]), str(row["index"]), font=font(11), anchor="lm", fill=COLORS["ink"])
            else:
                pos = (12 + coord, 36 + enlarged.height)
                draw.line((pos[0], pos[1], pos[0], pos[1] + 4), fill=COLORS["index"])
                draw.text((pos[0], pos[1] + 6), str(row["index"]), font=font(11), anchor="mt", fill=COLORS["ink"])
        target = f'{heading["file"][:-4]}-word-proof-{ordinal}.png'
        frame.save(root / target)
        for row in boundaries:
            row["detailFile"] = target
        files.append({"word": text, "file": target, "start": glyphs[0]["start"],
                      "end": glyphs[-1]["end"], "boundaries": [r["index"] for r in boundaries]})
    return files


def proof_sheets(root, page, heading, scale, rows):
    """Index every source boundary against real, intact browser raster. Paginate long copy."""
    names = []
    stem = heading["file"][:-4]
    notes = {"visual-only": "Inspect the painted shapes", "ink-sample": "Shared-row sample",
             "word-space": "Word boundary", "line-break": "Different lines",
             "no-rendered-area": "No separate painted range", "column-clearance": "Clear columns"}
    tile_w, tile_h = 272, 172
    for offset in range(0, max(1, len(rows)), 12):
        group = rows[offset:offset + 12]
        width = 3 * tile_w + 4 * 12
        with Image.open(root / heading["file"]) as raw:
            overview = raw.convert("RGB")
        overview.thumbnail((width - 32, 142), Image.Resampling.LANCZOS)
        header = 72 + overview.height
        height = header + max(1, math.ceil(len(group) / 3)) * tile_h + 24
        sheet = Image.new("RGB", (width, height), COLORS["mat"])
        draw = ImageDraw.Draw(sheet)
        draw.text((16, 9), "Headline proof", font=font(20), fill=COLORS["ink"])
        sheet.paste(overview, (16, 39))
        segment = f"Boundaries {offset + 1}–{offset + len(group)} of {len(rows)}" if group else "No adjacent graphemes"
        draw.text((16, 45 + overview.height), segment, font=font(14), fill=COLORS["ink"])
        for pos, row in enumerate(group):
            x = 12 + (pos % 3) * (tile_w + 12)
            y = header + (pos // 3) * tile_h
            draw.rounded_rectangle((x, y, x+tile_w, y+tile_h-10), 6, fill="white", outline=COLORS["rule"])
            def label(text):
                return "space" if text.isspace() else text
            title = f'{row["index"]:02d}   {label(row["left"])}  /  {label(row["right"])}'
            draw.text((x+9, y+6), title, font=font(17), fill=COLORS["ink"])
            if row["method"] not in {"line-break", "no-rendered-area"}:
                bounds = pixels(bbox(row["boxes"], 3), scale)
                native = page.crop(bounds)
                factor = min((tile_w - 18) / native.width, 91 / native.height, 3)
                shape = (max(1, round(native.width * factor)), max(1, round(native.height * factor)))
                thumb = native.resize(shape, Image.Resampling.NEAREST if factor > 1 else Image.Resampling.LANCZOS)
                px, py = x + (tile_w - shape[0]) // 2, y + 33 + (91 - shape[1]) // 2
                sheet.paste(thumb, (px, py))
                gap = row["columnClearance"]
                if gap:
                    # Underline the verified clear strip on the margin, preserving original ink.
                    for coord in ("x1", "x2"):
                        gx = px + round((gap[coord] * scale - bounds[0]) * shape[0] / native.width)
                        draw.line((gx, y+123, gx, y+128), fill=COLORS["index"])
            note = notes[row["method"]]
            metric = row["columnClearance"] or row["inkSample"]
            if metric:
                note += f' · {metric["cssPx"]:.2f} CSS px'
            draw.text((x+9, y+135), note, font=font(13), fill=COLORS["ink"])
        target = f"{stem}-proof-{len(names)+1}.png"
        sheet.save(root / target)
        names.append(target)
    return names



def describe(root, page, heading, scale, requests, proof=False):
    heading_bounds = bbox([line["box"] for line in heading["lines"]] or [heading["box"]],6)
    heading["cropBox"] = save_crop(page,heading_bounds,scale,root/heading["file"])
    words,pairs,ranked = analyze(page,heading,scale)
    selected = []
    for word,pair in requests:
        if not word and not pair:
            continue
        found=requested_pair(pairs,word,pair)
        if found is None:
            heading.setdefault("diagnosticWarnings",[]).append("Requested word or pair could not be isolated on one line.")
        elif found not in selected:
            selected.append(found)
    for p in ranked[:2]:
        if p not in selected:
            selected.append(p)
    if not selected and pairs:
        selected.append(next((p for p in pairs if p["ink"]), pairs[0]))
    heading["details"] = []
    for i,p in enumerate(selected,1):
        stem=heading["file"][:-4]+"-detail-"+str(i)
        word_file=stem+"-word.png"
        word_box=save_crop(page,bbox([g["box"] for g in p["wordGlyphs"]],4),scale,root/word_file)
        boxes=[g["box"] for g in p["letters"]]
        bounds=pixels(bbox(boxes,7),scale)
        native=page.crop(bounds)
        # Magnify the complete shaped pair in context. Outside-edge ticks identify each
        # range. A separate accent line shows the actual sampled inter-stroke whitespace.
        zoom=max(2,min(6,round(4/scale)))
        native=native.resize((native.width*zoom,native.height*zoom),Image.Resampling.NEAREST)
        image=Image.new("RGB",(max(245,native.width),native.height+32),"white")
        image.paste(native,(0,0))
        draw=ImageDraw.Draw(image)
        for idx,b in enumerate(boxes):
            color=COLORS["index"]
            x1=(b["x"]*scale-bounds[0])*zoom
            x2=((b["x"]+b["width"])*scale-bounds[0])*zoom
            y=native.height-5-idx*4
            draw.line((x1,y,x2,y),fill=color,width=2)
            for x in (x1,x2):
                draw.line((x,y-4,x,y+1),fill=color,width=2)
        if p["ink"]:
            a=p["ink"]
            x1=(a["x1"]*scale-bounds[0])*zoom
            x2=(a["x2"]*scale-bounds[0])*zoom
            y=(a["y"]*scale-bounds[1])*zoom
            draw.line((x1,y,x2,y),fill=COLORS["paper"],width=4)
            draw.line((x1,y,x2,y),fill=COLORS["distance"],width=2)
            for x in (x1, x2):
                draw.line((x,y-3,x,y+3),fill=COLORS["distance"],width=1)
        caption="Range ticks" + ("  /  Ink sample " + str(p["ink"]["cssPx"]) + " CSS px" if p["ink"] else "")
        draw.text((6,native.height+7),caption,font=font(12),fill=COLORS["ink"])
        target=stem+".png"
        image.save(root/target)
        heading["details"].append({"word":p["word"],"pair":p["pair"],"wordFile":word_file,"wordBox":word_box,
            "file":target,"box":rect(tuple(a/scale for a in bounds)), "inkSample":p["ink"],
            "rangeGap":p["advanceGap"]})
    if proof:
        rows = boundary_proof(page, heading, scale, pairs)
        heading["proof"] = {
            "boundaries": rows,
            "words": word_proofs(root, page, heading, scale, words, rows),
            "sheets": proof_sheets(root, page, heading, scale, rows),
        }
    return heading_bounds


def contact_sheets(root, report, profile):
    items=[(view,head) for view,capture in report["captures"][profile].items() for head in capture["headings"]]
    files=[]
    for start in range(0,len(items),12):
        group=items[start:start+12]
        sheet=Image.new("RGB",(1000, 45+math.ceil(len(group)/2)*145),COLORS["mat"])
        draw=ImageDraw.Draw(sheet)
        draw.text((16,12),profile+"   /   Headline inventory",font=font(17),fill=COLORS["ink"])
        for i,(view,h) in enumerate(group):
            x=16+(i%2)*495; y=49+(i//2)*145
            draw.text((x,y),view,font=font(12),fill=COLORS["ink"])
            with Image.open(root/h["file"]) as im:
                im.thumbnail((467,109))
                sheet.paste(im,(x,y+20))
        target=f"{profile}/contact-{len(files)+1}.png"
        sheet.save(root/target)
        files.append(target)
    return files


def main(report_path):
    root=report_path.parent
    report=json.loads(report_path.read_text())
    report["contactSheets"]={}
    for pid,views in report["captures"].items():
        scale=report["profiles"][pid]["scale"]
        for capture in views.values():
            with Image.open(root/capture["file"]) as image:
                baseline=image.convert("RGB")
            for heading in capture["headings"]:
                requests=[(v.get("word"),v.get("pair")) for v in heading["variants"]]
                before=describe(root,baseline,heading,scale,requests,report.get("proof", False))
                for variant in heading["variants"]:
                    with Image.open(root/variant["pageFile"]) as image:
                        page=image.convert("RGB")
                    after=describe(root,page,variant,scale,[(variant.get("word"),variant.get("pair"))],report.get("proof", False))
                    bounds=bbox([rect(before),rect(after)])
                    stem=variant["file"][:-4]
                    original,file=stem+"-original.png",stem+"-candidate.png"
                    compare_box=save_crop(baseline,bounds,scale,root/original)
                    save_crop(page,bounds,scale,root/file)
                    variant["comparison"]={"original":original,"file":file,"box":compare_box}
        report["contactSheets"][pid]=contact_sheets(root,report,pid)
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")


if __name__=="__main__":
    main(Path(sys.argv[1]))
