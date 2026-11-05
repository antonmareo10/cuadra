import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunResult } from "../lib/engine/types";
import { boxForSpan, picturesFor, type CaseLayout } from "../lib/ui/paper";
import { amountProof, accountProof } from "../lib/ui/proof";

const read = <T>(...p: string[]): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), ...p), "utf8"));

describe("findings on the page pictures", () => {
  it("puts the meat claim on line 13 of the invoice picture, on the 6,000 cell", () => {
    const run = read<RunResult>("public", "runs", "meat-short-weight.json");
    const layout = read<CaseLayout>("public", "paper", "meat-short-weight", "layout.json");
    const proof = amountProof(run)!;
    const inv = proof.sources[0];
    const at = boxForSpan(run.documents.find((d) => d.kind === "invoice")!, layout.invoice, inv.start, inv.end)!;
    expect(at.line).toBe(13);
    expect(at.cells).toHaveLength(1);
    // The PDF prints "6,000 kg" as one piece: the mark covers the number only.
    const cell = layout.invoice!.lines["13"].cells.find((c) => c[0] === "6,000 kg")!;
    expect(at.cells[0][0]).toBeCloseTo(cell[1], 1);
    expect(at.cells[0][2]).toBeLessThan(cell[3] - 10);
    const dn = proof.sources[1];
    const atDn = boxForSpan(run.documents.find((d) => d.kind === "delivery")!, layout.delivery, dn.start, dn.end)!;
    expect(atDn.line).toBe(12);
    expect(layout.delivery!.lines["12"].cells.find((c) => c[0] === "5,200")!.slice(1)).toEqual(atDn.cells[0]);
  });

  it("finds the hidden white text of the fish invoice on the page (line 29)", () => {
    const run = read<RunResult>("public", "runs", "fish-bank-change.json");
    const layout = read<CaseLayout>("public", "paper", "fish-bank-change", "layout.json");
    const hidden = accountProof(run)!.sources[1];
    const at = boxForSpan(run.documents.find((d) => d.kind === "invoice")!, layout.invoice, hidden.start, hidden.end)!;
    expect(at.line).toBe(29);
    expect(at.box[3] - at.box[1]).toBeLessThan(3); // 1-point text
  });

  it("maps every line of every recorded text document to a box", () => {
    for (const id of fs.readdirSync(path.join(process.cwd(), "public", "runs")).filter((f) => f !== "index.json").map((f) => f.replace(/\.json$/, ""))) {
      const run = read<RunResult>("public", "runs", `${id}.json`);
      const layout = read<CaseLayout>("public", "paper", id, "layout.json");
      for (const d of run.documents.filter((x) => x.mode === "text")) {
        const lines = d.text.split("\n").filter((l) => l.trim()).length;
        expect(Object.keys(layout[d.kind]!.lines).length, `${id}/${d.kind}`).toBe(lines);
      }
      const pics = picturesFor(run, layout);
      expect(pics.length, id).toBe(run.documents.length);
      for (const p of pics) expect(fs.existsSync(path.join(process.cwd(), "public", p.src)), p.src).toBe(true);
    }
  });
});
