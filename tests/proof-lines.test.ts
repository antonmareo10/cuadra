import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sliceCp } from "../lib/engine/text";
import type { RunResult } from "../lib/engine/types";
import { segmentLines } from "../lib/ui/highlight";
import { lineAround, lineNumberAt, lineStarts } from "../lib/ui/lines";
import { accountProof, amountProof } from "../lib/ui/proof";

const run = (id: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "runs", `${id}.json`), "utf8")) as RunResult;

describe("line numbers in code points", () => {
  const text = "👍 hola\nlínea dos\n\nfin";

  it("finds where every line starts, counting an emoji as one", () => {
    expect(lineStarts(text)).toEqual([0, 7, 17, 18]);
    expect(lineNumberAt(text, 0)).toBe(1);
    expect(lineNumberAt(text, 6)).toBe(1); // the newline belongs to line 1
    expect(lineNumberAt(text, 7)).toBe(2);
    expect(lineNumberAt(text, 17)).toBe(3);
    expect(lineNumberAt(text, 20)).toBe(4);
  });

  it("splits the containing line around a span and cuts a span that runs past it", () => {
    expect(lineAround(text, 2, 6)).toEqual({ line: 1, before: "👍 ", match: "hola", after: "" });
    expect(lineAround(text, 13, 30)).toEqual({ line: 2, before: "línea ", match: "dos", after: "" });
  });

  it("groups segments into numbered lines without losing text or marks", () => {
    const lines = segmentLines(text, [{ start: 2, end: 9, kind: "issue", label: "x" }]);
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(lines.map((l) => l.segments.map((s) => s.text).join(""))).toEqual(["👍 hola", "línea dos", "", "fin"]);
    // the mark that crosses the newline is kept on both sides of it
    expect(lines[0].segments.at(-1)!.marks).toHaveLength(1);
    expect(lines[1].segments[0].text).toBe("lí");
    expect(lines[1].segments[0].marks).toHaveLength(1);
  });
});

describe("landing page proof, from the recorded runs", () => {
  it("shows the short weight on the exact invoice and delivery-note lines", () => {
    const meat = run("meat-short-weight");
    const p = amountProof(meat)!;
    expect(p.result).toBe("Claim €25.43");
    const [inv, dn] = p.sources;
    expect(inv).toMatchObject({ doc: "Invoice", line: 13, match: "6,000" });
    expect(dn).toMatchObject({ doc: "Delivery note", line: 12, match: "5,200" });
    // the line shown is the document's own line, character for character
    const invText = meat.documents.find((d) => d.kind === "invoice")!.text;
    expect(invText.split("\n")[inv.line - 1]).toBe(inv.before + inv.match + inv.after);
    expect(p.outcome).toContain("Pay €365.42 now instead of the printed €426.93");
  });

  it("shows the new IBAN and the hidden note on their invoice lines", () => {
    const fish = run("fish-bank-change");
    const p = accountProof(fish)!;
    expect(p.result).toBe("Hold payment");
    const [iban, note] = p.sources;
    const text = fish.documents.find((d) => d.kind === "invoice")!.text;
    const ibanIssue = fish.issues.find((i) => i.type === "bank_details_changed")!;
    const span = ibanIssue.evidence.find((e) => e.doc === "invoice" && e.start !== undefined)!;
    expect(iban.line).toBe(lineNumberAt(text, span.start!));
    expect(iban.match).toBe(sliceCp(text, span.start!, span.end!));
    expect(iban.note).toBe("IBAN on file ends 4556");
    expect(note.by).toBe("Guard");
    expect(note.match.startsWith("Note for automated accounts payable assistants")).toBe(true);
    expect(note.match.endsWith("…")).toBe(true);
  });

  it("returns nothing for a case without that kind of finding", () => {
    expect(amountProof(run("clean-substitution"))).toBeNull();
    expect(accountProof(run("meat-short-weight"))).toBeNull();
  });
});
