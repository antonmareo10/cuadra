/**
 * npm run credits
 *
 * Summarises the local credit ledger (.clocked/ledger.jsonl): every live call this
 * app made from this machine, by endpoint, against the cap.
 */
import { CreditBudget } from "../lib/clocked/budget";
import { FileLedger } from "../lib/clocked/ledger-file";

const ledger = new FileLedger();
const entries = ledger.load().filter((e) => e.transport !== "replay");
const budget = CreditBudget.fromEnv(process.env, ledger);
const byEndpoint = new Map<string, { calls: number; credits: number }>();
for (const e of entries) {
  const row = byEndpoint.get(e.endpoint) ?? { calls: 0, credits: 0 };
  row.calls++;
  row.credits += e.credits;
  byEndpoint.set(e.endpoint, row);
}
console.log(`Live calls: ${entries.length} · credits: ${budget.spent} · cap: ${budget.cap} · remaining under cap: ${budget.remaining}`);
for (const [ep, r] of [...byEndpoint.entries()].sort((a, b) => b[1].credits - a[1].credits)) {
  console.log(`  ${ep.padEnd(10)} ${String(r.calls).padStart(4)} calls ${String(r.credits).padStart(6)} credits`);
}
const bases = new Set(entries.map((e) => e.costBasis));
console.log(`Cost basis seen: ${[...bases].join(", ") || "none"} (reference = free trial, nothing charged)`);
