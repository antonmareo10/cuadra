"""Crop and encode the landing images listed in a jobs file (written by scripts/assets/landing.ts).

Each job: {src, out, width, page?, region?}. With page and region (in page units, the units of the
layout), the region is cut from the picture (white beyond the edges) and scaled to `width` px wide;
without them the whole picture is scaled. Written as WebP.
"""
import json
import sys

from PIL import Image

for job in json.load(open(sys.argv[1], encoding="utf8")):
    im = Image.open(job["src"]).convert("RGB")
    if "region" in job:
        pw, ph = job["page"]["width"], job["page"]["height"]
        sx, sy = im.width / pw, im.height / ph
        x0, y0, x1, y1 = job["region"]
        box = (round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy))
        canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), "white")
        canvas.paste(im.crop((max(box[0], 0), max(box[1], 0), min(box[2], im.width), min(box[3], im.height))), (max(-box[0], 0), max(-box[1], 0)))
        im = canvas
    h = round(im.height * job["width"] / im.width)
    im = im.resize((job["width"], h), Image.LANCZOS)
    im.save(job["out"], "WEBP", quality=80, method=6)
    print(f"{job['out']}: {job['width']}x{h}")
