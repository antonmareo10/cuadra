import { CreditBudget, type LedgerStore } from "./budget";
import { ClockedClient, httpTransport, type CallRecord } from "./client";

/** True when the server has a key. Never exposes the key itself. */
export function hasApiKey(env: Record<string, string | undefined> = process.env): boolean {
  return typeof env.CLOCKED_API_KEY === "string" && env.CLOCKED_API_KEY.trim().length > 0;
}

/**
 * Live client configured from the environment:
 *   CLOCKED_API_KEY      required (kept server-side, never logged)
 *   CLOCKED_CREDIT_CAP   hard cap in credits (default 6000)
 *   CLOCKED_CONCURRENCY  parallel requests (trial 1, with the hackathon code 4)
 */
export function createLiveClient(opts: {
  ledger?: LedgerStore;
  onCall?: (r: CallRecord) => void;
  env?: Record<string, string | undefined>;
} = {}): ClockedClient {
  const env = opts.env ?? process.env;
  const concurrency = Number(env.CLOCKED_CONCURRENCY ?? "1");
  return new ClockedClient({
    transport: httpTransport(env.CLOCKED_API_KEY?.trim()),
    budget: CreditBudget.fromEnv(env, opts.ledger),
    concurrency: Number.isFinite(concurrency) && concurrency >= 1 ? Math.min(concurrency, 4) : 1,
    onCall: opts.onCall,
  });
}
