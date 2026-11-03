/**
 * npm run record [-- case-id ...]
 *
 * Runs each sample case live against Clocked (credit cap active) and saves
 *   recordings/<case>.json   every request hash + real response (for replay and tests)
 *   public/runs/<case>.json  the reconciliation result the demo shows
 *
 * Without arguments it records every case in data/cases.
 */
import fs from "node:fs";
import path from "node:path";
import { ClockedClient, httpTransport, type CallRecord } from "../lib/clocked/client";
import { CreditBudget } from "../lib/clocked/budget";
import { FileLedger } from "../lib/clocked/ledger-file";
import { hasApiKey } from "../lib/clocked/live";
import { recordingTransport, type Recording } from "../lib/clocked/replay";
import { listCaseIds, loadCase, loadTruth } from "../lib/cases";
import { ENGINE_VERSION, reconcile } from "../lib/engine/run";
import { writeRun } from "./lib/runs";

async function main() {
  if (!hasApiKey()) {
    console.error("CLOCKED_API_KEY is not set (.env.local). Recording needs live calls.");
    process.exit(2);
  }
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : listCaseIds();
  const ledger = new FileLedger();
  const budget = CreditBudget.fromEnv(process.env, ledger);
  console.log(`Credit cap ${budget.cap}, spent so far ${budget.spent}`);
  fs.mkdirSync(path.join(process.cwd(), "recordings"), { recursive: true });

  for (const id of ids) {
    const input = loadCase(id);
    const transport = recordingTransport(httpTransport(process.env.CLOCKED_API_KEY?.trim()));
    const calls: CallRecord[] = [];
    const concurrency = Number(process.env.CLOCKED_CONCURRENCY ?? "1");
    const client = new ClockedClient({ transport, budget, concurrency: Number.isFinite(concurrency) ? Math.min(Math.max(concurrency, 1), 4) : 1, onCall: (r) => calls.push(r) });
    const recordedAt = new Date().toISOString();
    const t0 = Date.now();
    const result = await reconcile(client, input, { calls, source: { kind: "recorded", recordedAt, model: null } });
    const model =
      (transport.exchanges.map((x) => (x.body as { model?: string })?.model).find((m) => typeof m === "string") as string | undefined) ?? null;
    result.source.model = model;
    const rec: Recording = {
      caseId: id,
      recordedAt,
      engineVersion: ENGINE_VERSION,
      model,
      exchanges: transport.exchanges,
      calls,
      wallMs: Date.now() - t0,
    };
    result.totals.wallMs = rec.wallMs ?? result.totals.wallMs;
    fs.writeFileSync(path.join(process.cwd(), "recordings", `${id}.json`), JSON.stringify(rec) + "\n");
    writeRun(result);
    const truth = loadTruth(id);
    console.log(
      `${id.padEnd(22)} ${result.verdict.kind.padEnd(13)} (expected ${truth.verdict}) pay ${result.verdict.payNow.toFixed(2)} ` +
        `disputed ${result.verdict.disputed.toFixed(2)} pending ${result.verdict.pending.toFixed(2)} · ${result.issues.length} issues · ` +
        `${calls.length} calls · ${result.totals.credits} credits · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    );
    for (const i of result.issues) console.log(`    [${i.cls}] ${i.type} ${i.amount.toFixed(2)} ${i.resolution}${i.decision ? ` (Decide ${i.decision.action} ${Math.round(i.decision.confidence * 100)}%)` : ""} — ${i.title}`);
    if (result.errors.length) console.log("    errors:", result.errors.join(" | "));
  }
  console.log(`Total spent by this app: ${budget.spent} / cap ${budget.cap}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
