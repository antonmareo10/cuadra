import { createHash } from "node:crypto";
import { ClockedError } from "./errors";
import type { Endpoint, Transport, TransportRequest, TransportResponse } from "./client";

/**
 * Recorded runs. While recording, every live exchange is stored with a hash of its
 * request body. Replaying answers the same request from the recording, so the whole
 * engine (matching, checks, verdict) re-runs on real Clocked output without network,
 * credits or a key. A request the recording does not contain is an explicit error.
 */

export interface RecordedExchange {
  endpoint: Endpoint;
  hash: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface Recording {
  caseId: string;
  recordedAt: string;
  engineVersion: string;
  model: string | null;
  exchanges: RecordedExchange[];
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
    .join(",")}}`;
}

export function requestHash(endpoint: string, body: unknown): string {
  return createHash("sha256").update(endpoint).update("\n").update(stable(body)).digest("hex").slice(0, 32);
}

/** Wraps a live transport and keeps every exchange. */
export function recordingTransport(inner: Transport): Transport & { exchanges: RecordedExchange[] } {
  const exchanges: RecordedExchange[] = [];
  return {
    kind: "live",
    exchanges,
    async send(req: TransportRequest): Promise<TransportResponse> {
      const res = await inner.send(req);
      if (res.status >= 200 && res.status < 300) {
        exchanges.push({ endpoint: req.endpoint, hash: requestHash(req.endpoint, req.body), status: res.status, headers: res.headers, body: res.body });
      }
      return res;
    },
  };
}

/** Answers from a recording; identical requests are served in recorded order. */
export function replayTransport(rec: Recording): Transport {
  const queues = new Map<string, RecordedExchange[]>();
  for (const x of rec.exchanges) {
    const list = queues.get(x.hash) ?? [];
    list.push(x);
    queues.set(x.hash, list);
  }
  const used = new Map<string, number>();
  return {
    kind: "replay",
    async send(req: TransportRequest): Promise<TransportResponse> {
      const hash = requestHash(req.endpoint, req.body);
      const list = queues.get(hash);
      if (!list?.length) {
        throw new ClockedError("replay_miss", req.endpoint, `No recorded ${req.endpoint} response for request ${hash}`);
      }
      const i = used.get(hash) ?? 0;
      used.set(hash, i + 1);
      const x = list[Math.min(i, list.length - 1)];
      return { status: x.status, headers: { ...x.headers, "x-clocked-transport": "replay" }, body: x.body };
    },
  };
}
