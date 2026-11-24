"""Make native-scale crops and diagnostic copies from the original, already shaped page raster."""
import json
import math
from pathlib import Path
import re
from statistics import median
import sys
import unicodedata

from PIL import Image, ImageDraw, ImageFont


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


def font(size):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size=size)
    except OSError:
        return ImageFont.load_default()


def grapheme_words(heading):
    words = []
    current = []
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
                if abs(box["y"]+box["height"]/2 - (last["y"]+last["height"]/2)) > min(box["height"], last["height"])/2:
                    words.append(current)
                    current = []
            current.append({**glyph, "color": run["styles"]["color"]})
    if current:
        words.append(current)
    return words


def latin(text):
    return bool(text) and all("LATIN" in unicodedata.name(ch, "") or unicodedata.combining(ch) for ch in text)


def read_ink_gap(page, left, right, scale):
    """Find a row with painted strokes on each side of the boundary on a locally flat surface."""
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
    # Project RGB pixels onto the local text/background contrast vector. Only inspect
    # separator rows where each glyph has a facing stroke near the center of the pair.
    vector = tuple(f-c for f,c in zip(fg,bg))
    denominator = sum(k*k for k in vector)
    values = patch.load()
    def ink(x,y):
        return sum((v-c)*k for v,c,k in zip(values[x,y],bg,vector)) >= .50*denominator
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


def describe(root, page, heading, scale, requests):
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
            color=("#276e75","#8a4f61")[idx]
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
            draw.line((x1,y,x2,y),fill="#da5725",width=2)
        caption="Range ticks" + ("  /  Ink sample " + str(p["ink"]["cssPx"]) + " CSS px" if p["ink"] else "")
        draw.text((6,native.height+7),caption,font=font(12),fill="#263d42")
        target=stem+".png"
        image.save(root/target)
        heading["details"].append({"word":p["word"],"pair":p["pair"],"wordFile":word_file,"wordBox":word_box,
            "file":target,"box":rect(tuple(a/scale for a in bounds)), "inkSample":p["ink"],
            "rangeGap":p["advanceGap"]})
    return heading_bounds


def contact_sheets(root, report, profile):
    items=[(view,head) for view,capture in report["captures"][profile].items() for head in capture["headings"]]
    files=[]
    for start in range(0,len(items),12):
        group=items[start:start+12]
        sheet=Image.new("RGB",(1000, 45+math.ceil(len(group)/2)*145),"#f7f6f1")
        draw=ImageDraw.Draw(sheet)
        draw.text((16,12),profile+"   /   Headline inventory",font=font(17),fill="#243331")
        for i,(view,h) in enumerate(group):
            x=16+(i%2)*495; y=49+(i//2)*145
            draw.text((x,y),view,font=font(12),fill="#566c68")
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
                before=describe(root,baseline,heading,scale,requests)
                for variant in heading["variants"]:
                    with Image.open(root/variant["pageFile"]) as image:
                        page=image.convert("RGB")
                    after=describe(root,page,variant,scale,[(variant.get("word"),variant.get("pair"))])
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
