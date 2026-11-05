"""
python scripts/assets/pdf_pages.py

Renders every sample PDF to a page image and maps each line of the text Clocked read
(public/runs/<case>.json, documents[].text) to its box on the page, so the app can draw
"Invoice, line 13" on the picture of the document itself.

Writes:
  .assets/pages/<case>-<doc>.png        page images at 2.5x (input of scripts/assets/render.mjs)
  .assets/pages/<case>-<doc>.words.json every printed line with its box (placing stamps, handwriting)
  public/paper/<case>/layout.json       { doc: { width, height, lines: { "<n>": { box, cells: [[text, x0, y0, x1, y1]] } } } }
                                        in PDF points, origin top left; <n> is the 1-based line of Clocked's text

Needs PyMuPDF (pip install pymupdf). Deterministic for a given PDF.
"""
import glob
import json
import os
import re
import sys

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCALE = 2.5
OUT = os.path.join(ROOT, ".assets", "pages")


def norm(s: str) -> str:
    return re.sub(r"\s+", "", s)


def pdf_lines(page):
    """Printed lines in drawing order: text and box (points, origin top-left)."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"])
            if t.strip():
                size = max(s["size"] for s in l["spans"])
                out.append({"text": t, "box": [round(v, 2) for v in l["bbox"]], "size": round(size, 2)})
    return out


def union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def map_lines(text: str, printed):
    """Greedy match: each line of Clocked's text is one or more consecutive printed lines."""
    result = {}
    p = 0
    for n, line in enumerate(text.split("\n"), start=1):
        target = norm(line)
        if not target:
            continue
        acc, boxes, q = "", [], p
        while q < len(printed) and len(acc) < len(target):
            acc += norm(printed[q]["text"])
            boxes.append(printed[q]["box"])
            q += 1
            if not target.startswith(acc):
                break
        if acc == target:
            cells = [[printed[i]["text"].strip()] + printed[i]["box"] for i in range(p, q)]
            result[str(n)] = {"box": [round(v, 2) for v in union(boxes)], "cells": cells}
            p = q
            continue
        # Fallback: any single printed line that equals this line (drawing order differs).
        for item in printed:
            if norm(item["text"]) == target:
                result[str(n)] = {"box": item["box"], "cells": [[item["text"].strip()] + item["box"]]}
                break
    return result


def main():
    os.makedirs(OUT, exist_ok=True)
    pdfs = sorted(glob.glob(os.path.join(ROOT, "data", "cases", "*", "*.pdf")))
    pdfs += sorted(glob.glob(os.path.join(ROOT, "data", "paper", "*.pdf")))
    layouts = {}
    for path in pdfs:
        if os.sep + "paper" + os.sep in path:
            case = os.path.basename(path)[: -len("-printed.pdf")]
            doc = "delivery-printed"
        else:
            case = os.path.basename(os.path.dirname(path))
            doc = os.path.splitext(os.path.basename(path))[0]
        pdf = fitz.open(path)
        page = pdf[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), alpha=False)
        pix.save(os.path.join(OUT, f"{case}-{doc}.png"))
        printed = pdf_lines(page)
        with open(os.path.join(OUT, f"{case}-{doc}.words.json"), "w", encoding="utf-8") as f:
            json.dump({"width": page.rect.width, "height": page.rect.height, "lines": printed}, f, ensure_ascii=False, indent=1)
        run_file = os.path.join(ROOT, "public", "runs", f"{case}.json")
        if doc in ("po", "delivery", "invoice") and os.path.exists(run_file):
            run = json.load(open(run_file, encoding="utf-8"))
            read = next((d for d in run["documents"] if d["kind"] == doc), None)
            if read and read.get("text"):
                mapped = map_lines(read["text"], printed)
                total = sum(1 for l in read["text"].split("\n") if l.strip())
                layouts.setdefault(case, {})[doc] = {"width": page.rect.width, "height": page.rect.height, "lines": mapped}
                print(f"{case:22} {doc:9} {len(mapped)}/{total} lines placed")
    for case, docs in layouts.items():
        d = os.path.join(ROOT, "public", "paper", case)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "layout.json"), "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
