/**
 * Clocked offsets count Unicode code points in the original text (end exclusive).
 * JavaScript strings index UTF-16 code units, so an emoji in a WhatsApp export
 * shifts every later offset by one if we slice naively. These helpers convert.
 */

export function codePoints(text: string): string[] {
  return Array.from(text);
}

/** Slice by code-point offsets. */
export function sliceCp(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

/** Maps a code-point offset to a UTF-16 index (for rendering with String APIs). */
export function cpToUtf16(text: string): (cp: number) => number {
  const map: number[] = [];
  let u = 0;
  for (const ch of text) {
    map.push(u);
    u += ch.length;
  }
  map.push(u);
  return (cp: number) => map[Math.max(0, Math.min(cp, map.length - 1))];
}

/** Code-point length. */
export function cpLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/** Finds `needle` in `text` and returns code-point offsets, or null. */
export function findCp(text: string, needle: string, fromCp = 0): { start: number; end: number } | null {
  if (!needle) return null;
  const toU = cpToUtf16(text);
  const idx = text.indexOf(needle, toU(fromCp));
  if (idx < 0) return null;
  const start = cpLength(text.slice(0, idx));
  return { start, end: start + cpLength(needle) };
}

/**
 * Replaces the given code-point ranges (expanded to whole lines) with spaces,
 * keeping every other offset valid. Used to read a document with a flagged
 * injection passage removed.
 */
export function blankRanges(text: string, ranges: { start: number; end: number }[]): string {
  const cps = Array.from(text);
  for (const r of ranges) {
    let s = Math.max(0, r.start);
    let e = Math.min(cps.length, r.end);
    while (s > 0 && cps[s - 1] !== "\n") s--;
    while (e < cps.length && cps[e] !== "\n") e++;
    for (let i = s; i < e; i++) if (cps[i] !== "\n") cps[i] = " ";
  }
  return cps.join("");
}

export function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").toUpperCase().replace(/\s+/g, "").replace(/[‐-―]/g, "-");
}

export function normalizeIban(iban: string | null | undefined): string {
  return (iban ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Last four characters of an IBAN for display. */
export function ibanTail(iban: string): string {
  const n = normalizeIban(iban);
  return n.length > 4 ? `•••• ${n.slice(-4)}` : n;
}
