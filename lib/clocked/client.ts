import { CreditBudget } from "./budget";
import { ClockedError, kindForStatus } from "./errors";

export const CLOCKED_BASE_URL = "https://clocked.rezolve.ai/clocked";

export type Endpoint =
  | "decide"
  | "extract"
  | "fill"
  | "pii"
  | "injection"
  | "script"
  | "grounding"
  | "compare"
  | "rerank"
  | "pipeline";

export const ENDPOINT_LABEL: Record<Endpoint, string> = {
  decide: "Decide",
  extract: "Extract",
  fill: "Fill",
  pii: "Protect",
  injection: "Guard",
  script: "Inspect",
  grounding: "Verify",
  compare: "Compare",
  rerank: "Rerank",
  pipeline: "Pipeline",
};

/** What one HTTP exchange returned. Header names are lower-case. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface TransportRequest {
  endpoint: Endpoint;
  body: unknown;
  idempotencyKey: string;
  timeoutMs: number;
}

export interface Transport {
  readonly kind: "live" | "replay" | "fake";
  send(req: TransportRequest): Promise<TransportResponse>;
}

/** Metadata kept for every call: shown in the UI's call log and stored in recordings. */
export interface CallRecord {
  id: string;
  endpoint: Endpoint;
  label: string;
  status: number | null;
  ok: boolean;
  attempts: number;
  credits: number | null;
  costUsd: number | null;
  costBasis: string | null;
  modelMs: number | null;
  transport: string | null;
  wallMs: number;
  startedAt: string;
  error?: { kind: string; message: string };
}

export interface ClientOptions {
  transport: Transport;
  budget?: CreditBudget;
  maxAttempts?: number;
  timeoutMs?: number;
  concurrency?: number;
  /** Called after every call settles (success or failure). */
  onCall?: (record: CallRecord) => void;
  /** Injected for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for deterministic tests; defaults to crypto.randomUUID. */
  newKey?: () => string;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function headerNumber(h: Record<string, string>, name: string): number | null {
  const v = h[name];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Small counting semaphore so the account's concurrency limit is respected. */
class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export class ClockedClient {
  readonly transport: Transport;
  readonly budget: CreditBudget;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly onCall?: (record: CallRecord) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newKey: () => string;
  private readonly semaphore: Semaphore;
  private seq = 0;

  constructor(opts: ClientOptions) {
    this.transport = opts.transport;
    this.budget = opts.budget ?? new CreditBudget();
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 4);
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.onCall = opts.onCall;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.newKey = opts.newKey ?? (() => crypto.randomUUID());
    this.semaphore = new Semaphore(Math.max(1, opts.concurrency ?? 1));
  }

  /**
   * Sends one logical request. One Idempotency-Key per logical request; retries of
   * 429 / 5xx / network failures reuse it with the identical body, so a retry can
   * never be billed twice. `retryAsNew` stops the retries.
   */
  async call<T = unknown>(
    endpoint: Endpoint,
    body: unknown,
    label: string = ENDPOINT_LABEL[endpoint],
  ): Promise<{ data: T; record: CallRecord }> {
    await this.semaphore.acquire();
    if (this.transport.kind === "live") {
      try {
        this.budget.assertCanSend(endpoint); // checked inside the slot so parallel calls cannot overshoot
      } catch (err) {
        this.semaphore.release();
        throw err;
      }
    }
    const id = `c${++this.seq}`;
    const idempotencyKey = this.newKey();
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    let attempts = 0;
    let lastError: ClockedError | null = null;
    let lastStatus: number | null = null;
    let sawUnknownOutcome = false;

    try {
      while (attempts < this.maxAttempts) {
        attempts++;
        let res: TransportResponse;
        try {
          res = await this.transport.send({ endpoint, body, idempotencyKey, timeoutMs: this.timeoutMs });
        } catch (err) {
          if (err instanceof ClockedError) throw err; // replay miss, no key: not retryable
          sawUnknownOutcome = true;
          lastError = new ClockedError("network", endpoint, err instanceof Error ? err.message : String(err));
          await this.backoff(attempts);
          continue;
        }
        lastStatus = res.status;

        if (res.status >= 200 && res.status < 300) {
          const record = this.finish({
            id,
            endpoint,
            label,
            status: res.status,
            ok: true,
            attempts,
            headers: res.headers,
            startedAt,
            wallMs: Date.now() - t0,
          });
          return { data: res.body as T, record };
        }

        const errBody = (res.body ?? {}) as { error?: unknown; detail?: unknown; retryAsNew?: boolean };
        const message = describeError(errBody);
        const retryAsNew = errBody.retryAsNew === true;
        lastError = new ClockedError(kindForStatus(res.status), endpoint, message, {
          status: res.status,
          retryAsNew,
        });

        // 409 after an unknown outcome usually means our first attempt is still running.
        const retryConflict = res.status === 409 && sawUnknownOutcome && !retryAsNew;
        if ((RETRYABLE.has(res.status) || retryConflict) && !retryAsNew) {
          if (res.status >= 500) sawUnknownOutcome = true;
          await this.backoff(attempts, res.headers["retry-after"]);
          continue;
        }
        break;
      }
      throw lastError ?? new ClockedError("server", endpoint, "Request failed");
    } catch (err) {
      const e =
        err instanceof ClockedError ? err : new ClockedError("server", endpoint, String(err), { status: lastStatus });
      this.finish({
        id,
        endpoint,
        label,
        status: e.status ?? lastStatus,
        ok: false,
        attempts,
        headers: {},
        startedAt,
        wallMs: Date.now() - t0,
        error: { kind: e.kind, message: e.message },
      });
      throw e;
    } finally {
      this.semaphore.release();
    }
  }

  private async backoff(attempt: number, retryAfter?: string): Promise<void> {
    if (attempt >= this.maxAttempts) return;
    const hinted = retryAfter !== undefined ? Number(retryAfter) * 1000 : NaN;
    const base = Number.isFinite(hinted) && hinted > 0 ? hinted : 500 * 2 ** (attempt - 1);
    const jitter = Math.random() * 250;
    await this.sleep(Math.min(base, 8000) + jitter);
  }

  private finish(p: {
    id: string;
    endpoint: Endpoint;
    label: string;
    status: number | null;
    ok: boolean;
    attempts: number;
    headers: Record<string, string>;
    startedAt: string;
    wallMs: number;
    error?: { kind: string; message: string };
  }): CallRecord {
    const record: CallRecord = {
      id: p.id,
      endpoint: p.endpoint,
      label: p.label,
      status: p.status,
      ok: p.ok,
      attempts: p.attempts,
      credits: headerNumber(p.headers, "x-clocked-credits"),
      costUsd: headerNumber(p.headers, "x-clocked-cost-usd"),
      costBasis: p.headers["x-clocked-cost-basis"] ?? null,
      modelMs: headerNumber(p.headers, "x-clocked-model-ms"),
      transport: p.headers["x-clocked-transport"] ?? (this.transport.kind === "live" ? null : this.transport.kind),
      wallMs: p.wallMs,
      startedAt: p.startedAt,
      ...(p.error ? { error: p.error } : {}),
    };
    if (p.ok && this.transport.kind === "live") {
      this.budget.record({
        at: p.startedAt,
        endpoint: p.endpoint,
        label: p.label,
        credits: record.credits ?? 0,
        costUsd: record.costUsd,
        costBasis: record.costBasis,
        transport: record.transport,
      });
    }
    this.onCall?.(record);
    return record;
  }
}

function describeError(body: { error?: unknown; detail?: unknown }): string {
  if (typeof body.error === "string") return body.error;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string };
        const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
        return [loc, item.msg].filter(Boolean).join(": ");
      })
      .join("; ");
  }
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return "Unknown error";
  }
}

/** Live transport over HTTPS. The key is held in a closure and never logged or serialised. */
export function httpTransport(apiKey: string | undefined, baseUrl: string = CLOCKED_BASE_URL): Transport {
  return {
    kind: "live",
    async send(req: TransportRequest): Promise<TransportResponse> {
      if (!apiKey) throw new ClockedError("no_key", req.endpoint, "CLOCKED_API_KEY is not set");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const res = await fetch(`${baseUrl}/${req.endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": req.idempotencyKey,
          },
          body: JSON.stringify(req.body),
          signal: controller.signal,
        });
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          if (key.toLowerCase().startsWith("x-clocked") || key.toLowerCase() === "retry-after" || key.toLowerCase() === "server-timing") {
            headers[key.toLowerCase()] = value;
          }
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { error: text.slice(0, 300) };
        }
        return { status: res.status, headers, body };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
