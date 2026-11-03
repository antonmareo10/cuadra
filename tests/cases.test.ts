import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ClockedClient, type CallRecord } from "../lib/clocked/client";
import { replayTransport, type Recording } from "../lib/clocked/replay";
import { listCaseIds, loadCase, loadTruth } from "../lib/cases";
import { reconcile } from "../lib/engine/run";
import { findPdfScripts } from "../lib/engine/pdf-scripts";

/**
 * The engine re-runs on real recorded Clocked responses (no network, no key) and must
 * find exactly the discrepancies planted in each synthetic case.
 */
const recorded = listCaseIds().filter((id) => fs.existsSync(path.join(process.cwd(), "recordings", `${id}.json`)));

describe.each(recorded)("case %s (replayed from a real recording)", (id) => {
  it("reaches the planted verdict and finds every planted issue with its amount", async () => {
    const rec = JSON.parse(fs.readFileSync(path.join(process.cwd(), "recordings", `${id}.json`), "utf8")) as Recording;
    const calls: CallRecord[] = [];
    const client = new ClockedClient({ transport: replayTransport(rec), onCall: (c) => calls.push(c), sleep: async () => {} });
    const result = await reconcile(client, loadCase(id), {
      calls,
      source: { kind: "recorded", recordedAt: rec.recordedAt, model: rec.model },
    });
    const truth = loadTruth(id);

    expect(result.errors).toEqual([]);
    expect(result.verdict.kind).toBe(truth.verdict);
    expect(result.verdict.invoiceTotal).toBeCloseTo(truth.invoicePrintedTotal, 2);

    for (const planted of truth.planted) {
      const type = planted.type === "substitution" ? "not_ordered" : planted.type;
      const found = result.issues.filter((i) => i.type === type);
      expect(found.length, `${planted.type} not found`).toBeGreaterThan(0);
      if (planted.amount > 0) expect(found.some((i) => Math.abs(i.amount - planted.amount) < 0.011)).toBe(true);
    }
    // Nothing is claimed beyond what was planted.
    const plantedMoney = truth.planted.reduce((a, p) => a + p.amount, 0);
    expect(result.verdict.disputed).toBeCloseTo(plantedMoney, 2);
    // The independent recomputation agrees with what the owner is told to pay.
    if (result.verdict.kind !== "hold" && result.verdict.expectedPayable !== null) {
      expect(result.verdict.payNow + result.verdict.pending).toBeCloseTo(result.verdict.expectedPayable, 1);
    }
    expect(calls.every((c) => c.ok)).toBe(true);
  });
});

describe("embedded PDF scripts", () => {
  it("finds the script planted in the fraudulent invoice and nothing in the clean files", async () => {
    for (const id of listCaseIds()) {
      const c = loadCase(id);
      for (const d of c.documents.filter((x) => x.mime === "application/pdf")) {
        const scripts = await findPdfScripts(d.data);
        expect(scripts.length > 0, `${id}/${d.fileName}`).toBe(id === "fish-bank-change" && d.kind === "invoice");
      }
    }
  });
});
