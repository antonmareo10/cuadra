import { ClockedError } from "./errors";

/**
 * Hard credit cap, enforced in the client before any request is sent.
 *
 * - Every settled request adds its X-Clocked-Credits to the ledger.
 * - A request is refused locally when `spent + reserve(endpoint) > cap`,
 *   where the reserve is the worst case we allow one request to cost.
 * - Any response billed as something other than the free trial
 *   ("reference") stops all further calls, unless CLOCKED_ALLOW_PAID=1.
 *   The trial is never charged, so a paid basis means the account changed
 *   and a human should look before more work is sent.
 */

export interface LedgerEntry {
  at: string;
  endpoint: string;
  label?: string;
  credits: number;
  costUsd: number | null;
  costBasis: string | null;
  transport: string | null;
}

export interface LedgerStore {
  load(): LedgerEntry[];
  append(entry: LedgerEntry): void;
}

export class MemoryLedger implements LedgerStore {
  private entries: LedgerEntry[] = [];
  load() {
    return [...this.entries];
  }
  append(entry: LedgerEntry) {
    this.entries.push(entry);
  }
}

/** Worst-case credits one request may use; the pipeline gateway reservation is 800. */
export const RESERVE_BY_ENDPOINT: Record<string, number> = {
  pipeline: 800,
  extract: 400,
  fill: 400,
  compare: 300,
  grounding: 200,
  pii: 150,
  injection: 100,
  script: 100,
  decide: 100,
  rerank: 60,
};

export const DEFAULT_CREDIT_CAP = 6000;

export class CreditBudget {
  readonly cap: number;
  readonly allowPaid: boolean;
  private store: LedgerStore;
  private spentCredits: number;
  private stopReason: string | null = null;

  constructor(opts: { cap?: number; store?: LedgerStore; allowPaid?: boolean } = {}) {
    this.cap = opts.cap ?? DEFAULT_CREDIT_CAP;
    this.allowPaid = opts.allowPaid ?? false;
    this.store = opts.store ?? new MemoryLedger();
    this.spentCredits = this.store
      .load()
      .filter((e) => e.transport !== "replay")
      .reduce((sum, e) => sum + (Number.isFinite(e.credits) ? e.credits : 0), 0);
  }

  static fromEnv(env: Record<string, string | undefined>, store?: LedgerStore): CreditBudget {
    const raw = env.CLOCKED_CREDIT_CAP;
    const cap = raw !== undefined && raw.trim() !== "" ? Number(raw) : DEFAULT_CREDIT_CAP;
    return new CreditBudget({
      cap: Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_CREDIT_CAP,
      store,
      allowPaid: env.CLOCKED_ALLOW_PAID === "1",
    });
  }

  get spent(): number {
    return this.spentCredits;
  }

  get remaining(): number {
    return Math.max(0, this.cap - this.spentCredits);
  }

  get stopped(): string | null {
    return this.stopReason;
  }

  reserveFor(endpoint: string): number {
    return RESERVE_BY_ENDPOINT[endpoint] ?? 200;
  }

  /** Throws before anything is sent if this request could break the cap. */
  assertCanSend(endpoint: string): void {
    if (this.stopReason) {
      throw new ClockedError("budget", endpoint, `Calls stopped: ${this.stopReason}`);
    }
    const reserve = this.reserveFor(endpoint);
    if (this.spentCredits + reserve > this.cap) {
      throw new ClockedError(
        "budget",
        endpoint,
        `Credit cap reached: ${this.spentCredits} spent + ${reserve} reserved > cap ${this.cap}`,
      );
    }
  }

  /** Records a settled request and applies the paid-basis stop. */
  record(entry: LedgerEntry): void {
    const isReplay = entry.transport === "replay";
    if (!isReplay) this.spentCredits += Number.isFinite(entry.credits) ? entry.credits : 0;
    this.store.append(entry);
    const basis = (entry.costBasis ?? "").toLowerCase();
    if (!isReplay && basis && basis !== "reference" && !this.allowPaid) {
      this.stopReason = `response billed as "${basis}" (not the free trial); set CLOCKED_ALLOW_PAID=1 only if that is intended`;
    }
    if (this.spentCredits >= this.cap && !this.stopReason) {
      this.stopReason = `credit cap ${this.cap} reached`;
    }
  }
}
