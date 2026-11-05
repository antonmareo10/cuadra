import { cpToUtf16 } from "../engine/text";
import type { Issue, ReadDocument } from "../engine/types";
import { lineStarts } from "./lines";

export type MarkKind = "field" | "pii" | "issue" | "stop";

export interface Mark {
  start: number; // code points
  end: number;
  kind: MarkKind;
  label: string;
  id?: string; // issue id, for focus
}

export interface Segment {
  text: string;
  marks: Mark[];
  key: string;
  start: number;
  end: number;
}

const RANK: Record<MarkKind, number> = { field: 0, pii: 1, issue: 2, stop: 3 };

/** Everything worth marking in one document: extracted values, personal data, evidence of issues. */
export function marksFor(doc: ReadDocument, issues: Issue[]): Mark[] {
  const marks: Mark[] = [];
  const add = (start: number | undefined, end: number | undefined, kind: MarkKind, label: string, id?: string) => {
    if (start === undefined || end === undefined || end <= start) return;
    marks.push({ start, end, kind, label, id });
  };
  for (const [k, f] of Object.entries(doc.header)) add(f.start, f.end, "field", `Extract · ${k.replace(/_/g, " ")}`);
  for (const l of doc.lines) {
    for (const [k, f] of Object.entries({ code: l.code, description: l.description, quantity: l.quantity, unit: l.unit, price: l.unitPrice, vat: l.vatRate, amount: l.amount })) {
      add(f.start, f.end, "field", `Extract · line ${l.index + 1} ${k}`);
    }
  }
  for (const r of doc.returns) for (const f of [r.product, r.quantity, r.reason]) add(f.start, f.end, "field", "Extract · returned at delivery");
  for (const p of doc.pii) add(p.start, p.end, "pii", `Protect · ${p.type.replace(/_/g, " ")}`);
  for (const i of issues) {
    for (const e of i.evidence) {
      if (e.doc !== doc.kind || e.quote.length > 160) continue;
      add(e.start, e.end, i.cls === "stop" ? "stop" : "issue", `${e.by} · ${i.title}`, i.id);
    }
  }
  if (doc.guard?.flagged) for (const e of doc.guard.evidence) add(e.start, e.end, "stop", `Guard · ${doc.guard.category}`);
  return marks;
}

export interface TextLine {
  /** 1-based, the same numbering the evidence chips use. */
  n: number;
  segments: Segment[];
}

/** Like `segment`, but grouped into lines (newlines dropped) so the document view can number them. */
export function segmentLines(text: string, marks: Mark[], extraCuts: number[] = []): TextLine[] {
  const breaks = lineStarts(text).slice(1);
  const segs = segment(text, marks, [...extraCuts, ...breaks, ...breaks.map((b) => b - 1)]);
  const lines: TextLine[] = [{ n: 1, segments: [] }];
  for (const s of segs) {
    if (s.text === "\n") lines.push({ n: lines.length + 1, segments: [] });
    else lines[lines.length - 1].segments.push(s);
  }
  return lines;
}

/** Splits text into segments, each carrying every mark that covers it. */
export function segment(text: string, marks: Mark[], extraCuts: number[] = []): Segment[] {
  const toU = cpToUtf16(text);
  const cuts = new Set<number>([0, Array.from(text).length]);
  for (const m of extraCuts) cuts.add(m);
  for (const m of marks) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const covering = marks.filter((m) => m.start <= a && m.end >= b).sort((x, y) => RANK[y.kind] - RANK[x.kind]);
    out.push({ text: text.slice(toU(a), toU(b)), marks: covering, key: `${a}-${b}`, start: a, end: b });
  }
  return out;
}
