import fs from "node:fs";
import path from "node:path";
import { loadManifest } from "../../lib/cases";
import type { RunResult } from "../../lib/engine/types";

const PUBLIC = path.join(process.cwd(), "public");

/** Writes the demo copy of a run and the case's original documents under public/. */
export function writeRun(result: RunResult): void {
  const runs = path.join(PUBLIC, "runs");
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(path.join(runs, `${result.caseId}.json`), JSON.stringify(result) + "\n");

  const m = loadManifest(result.caseId);
  const out = path.join(PUBLIC, "cases", result.caseId);
  fs.mkdirSync(out, { recursive: true });
  for (const d of m.documents) {
    fs.copyFileSync(path.join(process.cwd(), "data", "cases", result.caseId, d.file), path.join(out, d.file));
  }
  writeIndex();
}

export function writeIndex(): void {
  const runs = path.join(PUBLIC, "runs");
  const items = fs
    .readdirSync(runs)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(runs, f), "utf8")) as RunResult)
    .map((r) => ({
      caseId: r.caseId,
      title: r.title,
      story: r.story,
      supplier: r.supplier.name,
      verdict: r.verdict,
      issues: r.issues.filter((i) => i.cls !== "info").length,
      endpoints: [...new Set(r.calls.map((c) => c.endpoint))],
      calls: r.calls.length,
      credits: r.totals.credits,
      recordedAt: r.source.recordedAt,
    }));
  const order = ["meat-short-weight", "fish-bank-change", "drinks-vat-return", "veg-duplicate", "clean-substitution"];
  items.sort((a, b) => (order.indexOf(a.caseId) + 99) % 99 - (order.indexOf(b.caseId) + 99) % 99);
  fs.writeFileSync(path.join(runs, "index.json"), JSON.stringify(items, null, 2) + "\n");
}
