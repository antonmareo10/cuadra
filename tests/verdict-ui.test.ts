import { describe, expect, it } from "vitest";
import { computeVerdict } from "../lib/engine/checks";
import { dedupeEvidence } from "../lib/engine/judge";
import type { Issue, ReadDocument } from "../lib/engine/types";
import { segment } from "../lib/ui/highlight";

const invoice = {
  kind: "invoice",
  readable: true,
  header: { total: { value: "100,00 €", number: 100 } },
} as unknown as ReadDocument;

const issue = (id: string, cls: Issue["cls"], amount: number, resolution: Issue["resolution"]): Issue => ({
  id,
  type: "billed_not_delivered",
  cls,
  title: id,
  detail: "",
  amount,
  evidence: [],
  sources: [],
  resolution,
});

describe("computeVerdict", () => {
  it("pays the invoice minus claimed and pending amounts", () => {
    const v = computeVerdict(invoice, [issue("a", "money", 10, "credit_note"), issue("b", "review", 5, "confirm"), issue("c", "money", 3, "accept")], 85);
    expect(v.kind).toBe("pay_adjusted");
    expect(v.payNow).toBe(85);
    expect(v.disputed).toBe(10);
    expect(v.pending).toBe(5);
  });

  it("holds everything when any issue is on hold, and clears when the owner accepts it", () => {
    expect(computeVerdict(invoice, [issue("s", "stop", 0, "hold")], null).kind).toBe("hold");
    expect(computeVerdict(invoice, [issue("m", "money", 4, "hold")], null).payNow).toBe(0);
    expect(computeVerdict(invoice, [issue("s", "stop", 0, "accept")], null).kind).toBe("ready");
  });

  it("never approves an unreadable invoice", () => {
    const blank = { ...invoice, readable: false, header: {} } as ReadDocument;
    expect(computeVerdict(blank, [], null).kind).toBe("unreadable");
  });
});

describe("evidence and highlighting", () => {
  it("merges the same quote found by two endpoints", () => {
    const out = dedupeEvidence([
      { doc: "delivery", quote: "5,200", start: 3, end: 8, by: "Extract" },
      { doc: "delivery", quote: "5,200", by: "Compare" },
      { doc: "invoice", quote: "6,000", by: "Extract" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].by).toBe("Extract · Compare");
  });

  it("segments text by code-point marks, emoji included", () => {
    const text = "👍 pago 12,50";
    const segs = segment(text, [{ start: 7, end: 12, kind: "field", label: "x" }]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.find((s) => s.marks.length)?.text).toBe("12,50");
  });
});
