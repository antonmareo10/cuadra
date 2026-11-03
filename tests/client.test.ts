import { describe, expect, it } from "vitest";
import { CreditBudget, MemoryLedger } from "../lib/clocked/budget";
import { ClockedClient, type Transport, type TransportRequest, type TransportResponse } from "../lib/clocked/client";
import { ClockedError } from "../lib/clocked/errors";

function fake(responses: (TransportResponse | Error)[]): Transport & { seen: TransportRequest[] } {
  const seen: TransportRequest[] = [];
  return {
    kind: "live",
    seen,
    async send(req) {
      seen.push(req);
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const ok = (credits = 3, basis = "reference"): TransportResponse => ({
  status: 200,
  headers: { "x-clocked-credits": String(credits), "x-clocked-cost-basis": basis, "x-clocked-model-ms": "70" },
  body: { model: "clocked-1.0" },
});

const client = (t: Transport, budget = new CreditBudget({ cap: 1000 })) =>
  new ClockedClient({ transport: t, budget, sleep: async () => {}, newKey: () => "key-1" });

describe("ClockedClient", () => {
  it("retries 429 and network errors with the same idempotency key and payload", async () => {
    const t = fake([{ status: 429, headers: {}, body: { error: "busy" } }, new Error("socket hang up"), ok()]);
    const { record } = await client(t).call("decide", { state: "x" });
    expect(t.seen).toHaveLength(3);
    expect(new Set(t.seen.map((r) => r.idempotencyKey))).toEqual(new Set(["key-1"]));
    expect(new Set(t.seen.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(record.attempts).toBe(3);
    expect(record.credits).toBe(3);
  });

  it("does not retry invalid requests and surfaces the service message", async () => {
    const t = fake([{ status: 422, headers: {}, body: { detail: [{ loc: ["body", "fields"], msg: "field required" }] } }]);
    await expect(client(t).call("extract", {})).rejects.toMatchObject({ kind: "invalid_request", status: 422 });
    expect(t.seen).toHaveLength(1);
  });

  it("stops retrying when the service says retryAsNew", async () => {
    const t = fake([{ status: 503, headers: {}, body: { error: "ended", retryAsNew: true } }, ok()]);
    await expect(client(t).call("fill", {})).rejects.toBeInstanceOf(ClockedError);
    expect(t.seen).toHaveLength(1);
  });

  it("refuses to send once the credit cap would be exceeded", async () => {
    const budget = new CreditBudget({ cap: 120, store: new MemoryLedger() });
    const t = fake([ok(30), ok(30)]);
    const c = client(t, budget);
    await c.call("rerank", {}); // reserve 60, spent 30
    await expect(c.call("extract", {})).rejects.toMatchObject({ kind: "budget" }); // 30 + 400 > 120
    expect(t.seen).toHaveLength(1);
  });

  it("halts all calls when a response is billed as anything but the free trial", async () => {
    const budget = new CreditBudget({ cap: 10_000 });
    const t = fake([ok(5, "overage"), ok()]);
    const c = client(t, budget);
    await c.call("decide", {});
    expect(budget.stopped).toMatch(/overage/);
    await expect(c.call("decide", {})).rejects.toMatchObject({ kind: "budget" });
  });

  it("never puts the key in an error message", async () => {
    const t = fake([{ status: 401, headers: {}, body: { error: "Use a Clocked account API key." } }]);
    const err = await client(t)
      .call("decide", {})
      .catch((e) => e as ClockedError);
    expect(err.kind).toBe("auth");
    expect(err.message).not.toMatch(/Bearer/);
  });
});
