import type { DocKind, ReadDocument, RunResult } from "../engine/types";
import { codePoints } from "../engine/text";
import { lineNumberAt, lineStarts } from "./lines";

/**
 * Pictures of the documents "as they arrived" (drawn by scripts/assets from the same files
 * Clocked read) and where each line of Clocked's text sits on them. A finding's span
 * (character offsets) → its line number → the box of that line on the page picture.
 */

export type Box = [number, number, number, number];
export interface LineLayout {
  box: Box;
  /** The printed pieces of the line (cells of a table row), each with its own box. */
  cells: [string, number, number, number, number][];
}
export interface PageLayout {
  width: number;
  height: number;
  lines: Record<string, LineLayout>;
}
export type CaseLayout = Partial<Record<DocKind, PageLayout>>;

export interface Picture {
  kind: DocKind;
  src: string;
  alt: string;
  /** "page": a picture of the PDF page (boxes can be drawn); "chat": the order on a phone; "photo": the photo Clocked read. */
  form: "page" | "chat" | "photo";
  width: number;
  height: number;
  caption: string;
}

/** What each document looked like when it arrived, for one case. */
export function picturesFor(run: Pick<RunResult, "caseId" | "documents">, layout: CaseLayout): Picture[] {
  const out: Picture[] = [];
  for (const d of run.documents) {
    const base = `/paper/${run.caseId}`;
    if (d.kind === "po" && d.mode === "plain") {
      out.push({ kind: "po", src: `${base}/chat.png`, alt: "The chef's order as a chat on his phone", form: "chat", width: 1075, height: 1900, caption: "The chef's WhatsApp order, as it looks on his phone. Clocked read the exported text." });
    } else if (d.photo) {
      out.push({ kind: d.kind, src: `${base}/delivery.jpg`, alt: "Phone photo of the paper delivery note, with quantities corrected by hand", form: "photo", width: 1800, height: 1350, caption: "The photo Clocked read: no text layer, no character positions. Synthetic, drawn for the demo." });
    } else {
      const page = layout[d.kind];
      if (!page) continue;
      const file = d.kind === "delivery" ? "delivery.jpg" : `${d.kind}.png`;
      const caption =
        d.kind === "delivery"
          ? "The paper copy signed in the kitchen. Clocked read the PDF of the same note; the stamp and signature are drawn on for the demo."
          : d.kind === "invoice"
            ? "The supplier's PDF invoice, page 1, exactly as Clocked read it."
            : "The restaurant's order sheet (PDF).";
      out.push({ kind: d.kind, src: `${base}/${file}`, alt: `${d.label}, page 1`, form: "page", width: page.width, height: page.height, caption });
    }
  }
  return out;
}

/** The line of the page picture that holds [start, end) of the document text, and the cells the span covers. */
export function boxForSpan(doc: Pick<ReadDocument, "text">, page: PageLayout | undefined, start: number, end: number, starts = lineStarts(doc.text)): { line: number; box: Box; cells: Box[] } | null {
  if (!page) return null;
  const line = lineNumberAt(doc.text, start, starts);
  const at = page.lines[String(line)];
  if (!at) return null;
  // Which printed pieces does the span cover? Walk the line's text cell by cell.
  const cps = codePoints(doc.text);
  const from = starts[line - 1];
  const to = (starts[line] ?? cps.length + 1) - 1;
  const lineText = cps.slice(from, to).join("");
  const cells: Box[] = [];
  let cursor = 0;
  for (const [text, x0, y0, x1, y1] of at.cells) {
    const i = lineText.indexOf(text, cursor);
    if (i < 0) continue;
    const a = from + Array.from(lineText.slice(0, i)).length;
    const n = Array.from(text).length;
    const b = a + n;
    cursor = i + text.length;
    if (a < end && b > start) {
      // A printed piece can hold two columns ("6,000 kg"): keep the part the span covers, by character share.
      const s0 = Math.max(start, a) - a;
      const s1 = Math.min(end, b) - a;
      const w = x1 - x0;
      cells.push(s0 === 0 && s1 === n ? [x0, y0, x1, y1] : [x0 + (w * s0) / n, y0, x0 + (w * s1) / n, y1]);
    }
  }
  return { line, box: at.box, cells };
}

/** Box as CSS percentages of the page. A 1-point line (hidden text) is grown so it can be seen. */
export function boxStyle(b: Box, page: { width: number; height: number }, pad = 2.5) {
  const minH = 9;
  const h = Math.max(b[3] - b[1], minH);
  const cy = (b[1] + b[3]) / 2;
  const y0 = cy - h / 2 - pad;
  return {
    left: `${((b[0] - pad) / page.width) * 100}%`,
    top: `${(y0 / page.height) * 100}%`,
    width: `${((b[2] - b[0] + pad * 2) / page.width) * 100}%`,
    height: `${((h + pad * 2) / page.height) * 100}%`,
  };
}
