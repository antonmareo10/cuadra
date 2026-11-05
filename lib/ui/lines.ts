import { codePoints } from "../engine/text";

/**
 * Line numbers for evidence. Clocked offsets index the document text in code points,
 * so everything here counts code points too (the WhatsApp order has emoji).
 */

/** Code-point offset where each line starts. Line 1 starts at 0. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  codePoints(text).forEach((ch, i) => {
    if (ch === "\n") starts.push(i + 1);
  });
  return starts;
}

/** 1-based line number of a code-point offset. */
export function lineNumberAt(text: string, cp: number, starts = lineStarts(text)): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= cp) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export interface LineQuote {
  /** 1-based line number in the document text. */
  line: number;
  before: string;
  match: string;
  after: string;
}

/** The line that contains [start, end), split around the span. A span that runs past the line is cut at its end. */
export function lineAround(text: string, start: number, end: number): LineQuote {
  const cps = codePoints(text);
  const starts = lineStarts(text);
  const line = lineNumberAt(text, start, starts);
  const from = starts[line - 1];
  const next = starts[line] ?? cps.length + 1;
  const to = next - 1; // the newline, or the end of the text
  const s = Math.max(from, Math.min(start, to));
  const e = Math.max(s, Math.min(end, to));
  return {
    line,
    before: cps.slice(from, s).join(""),
    match: cps.slice(s, e).join(""),
    after: cps.slice(e, to).join(""),
  };
}
