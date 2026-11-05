import fs from "node:fs";
import path from "node:path";
import { CreditBudget } from "../lib/clocked/budget";
import { ClockedClient, httpTransport, type CallRecord, type Transport } from "../lib/clocked/client";
import { ClockedError } from "../lib/clocked/errors";
import { FileLedger } from "../lib/clocked/ledger-file";
import { hasApiKey } from "../lib/clocked/live";
import { replayTransport, type Recording } from "../lib/clocked/replay";
import { listCaseIds, loadCase, loadManifest } from "../lib/cases";
import { reconcile } from "../lib/engine/run";
import type { CaseInput, DocKind, RunResult } from "../lib/engine/types";
import { buildInput, type UploadBody } from "../lib/live-run";

/**
 * How the MCP server reaches Clocked. Everything goes through the same `reconcile()`
 * the web app and the scripts use; only the transport changes:
 *   replay  answers from the real recordings in recordings/*.json (no key, no credits);
 *   live    calls Clocked with CLOCKED_API_KEY, behind the same hard credit cap
 *           (CLOCKED_CREDIT_CAP, ledger in .clocked/ledger.jsonl) as every other script.
 */

export type Mode = "replay" | "live";

export function chooseMode(env: Record<string, string | undefined> = process.env): Mode {
  if (env.CUADRA_MCP_MODE === "replay") return "replay";
  return hasApiKey(env) ? "live" : "replay";
}

const RECORDINGS = () => path.join(process.cwd(), "recordings");

function loadRecordings(): Recording[] {
  const dir = RECORDINGS();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Recording);
}

/** One recording per sample case (for its timestamps and model). */
export function recordingFor(caseId: string): Recording | null {
  if (!/^[a-z0-9-]+$/.test(caseId)) return null;
  const file = path.join(RECORDINGS(), `${caseId}.json`);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Recording) : null;
}

/** A transport that answers from every recording at once. A request nobody recorded is an explicit error. */
export function mergedReplayTransport(): Transport {
  const all = loadRecordings();
  return replayTransport({
    caseId: "all",
    recordedAt: all[0]?.recordedAt ?? "",
    engineVersion: all[0]?.engineVersion ?? "",
    model: all[0]?.model ?? null,
    exchanges: all.flatMap((r) => r.exchanges),
  });
}

export function liveBudget(env: Record<string, string | undefined> = process.env): CreditBudget {
  return CreditBudget.fromEnv(env, new FileLedger());
}

export class ReplayMissError extends Error {}

/** Runs one case through the engine and fails loudly if any call could not be answered. */
async function runInput(input: CaseInput, client: ClockedClient, calls: CallRecord[], source: RunResult["source"]): Promise<RunResult> {
  const result = await reconcile(client, input, { calls, source });
  const misses = calls.filter((c) => c.error?.kind === "replay_miss");
  if (misses.length) {
    throw new ReplayMissError(
      `${misses.length} of ${calls.length} Clocked requests for these documents are not in the recordings (first: ${misses[0].label}). ` +
        "Replay mode can only answer the recorded sample cases. Set CLOCKED_API_KEY to run these documents live.",
    );
  }
  return result;
}

/** A sample case, replayed from its real recording: the same path as `npm run runs`. */
export async function runSample(caseId: string): Promise<RunResult> {
  if (!listCaseIds().includes(caseId)) throw new Error(`Unknown sample case "${caseId}". Call list_sample_cases for the ids.`);
  const rec = recordingFor(caseId);
  if (!rec) throw new Error(`Sample case "${caseId}" has no recording yet (npm run record -- ${caseId}).`);
  const calls: CallRecord[] = [];
  const client = new ClockedClient({ transport: replayTransport(rec), onCall: (c) => calls.push(c), sleep: async () => {} });
  const result = await runInput(loadCase(caseId), client, calls, { kind: "recorded", recordedAt: rec.recordedAt, model: rec.model });
  // Show the call log as it happened live (credits, model time), as the web app does.
  if (rec.calls && rec.calls.length === calls.length) {
    result.calls = rec.calls;
    result.totals = {
      credits: rec.calls.reduce((a, c) => a + (c.credits ?? 0), 0),
      modelMs: Math.round(rec.calls.reduce((a, c) => a + (c.modelMs ?? 0), 0)),
      wallMs: rec.wallMs ?? result.totals.wallMs,
      calls: rec.calls.length,
    };
  }
  return result;
}

export interface FileArgs {
  invoice: string;
  delivery_note?: string;
  order?: string;
  supplier_id?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Largest file read from disk; buildInput applies the per-type limits after this. */
const MAX_FILE_BYTES = 3_000_000;

/** Resolves a path against the repository root and refuses anything that is not an existing regular file. */
export function readLocalFile(p: string, root = process.cwd()): { fileName: string; mime: string; data: string; full: string } {
  if (typeof p !== "string" || !p.trim()) throw new Error("A file path is required.");
  const full = path.resolve(root, p.trim());
  let st: fs.Stats;
  try {
    st = fs.statSync(full);
  } catch {
    throw new Error(`File not found: ${p}`);
  }
  if (!st.isFile()) throw new Error(`Not a regular file: ${p}`);
  if (st.size > MAX_FILE_BYTES) throw new Error(`${path.basename(full)} is ${(st.size / 1e6).toFixed(1)} MB; files up to about 2.5 MB fit the API.`);
  const ext = path.extname(full).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`${path.basename(full)}: use a PDF, a .txt file (for example a WhatsApp export) or a photo (.jpg, .png, .webp).`);
  const raw = fs.readFileSync(full);
  return { fileName: path.basename(full), mime, data: mime === "text/plain" ? raw.toString("utf8") : raw.toString("base64"), full };
}

/** When the three files are byte-identical to a sample case, that case (with its supplier record and earlier invoices) is what they are. */
export function sampleForFiles(files: { kind: DocKind; full: string }[]): string | null {
  for (const id of listCaseIds()) {
    const m = loadManifest(id);
    if (m.documents.length !== files.length) continue;
    const same = m.documents.every((d) => {
      const f = files.find((x) => x.kind === d.kind);
      if (!f) return false;
      const own = path.join(process.cwd(), "data", "cases", id, d.file);
      try {
        return fs.readFileSync(own).equals(fs.readFileSync(f.full));
      } catch {
        return false;
      }
    });
    if (same) return id;
  }
  return null;
}

export interface FileRun {
  result: RunResult;
  /** Set when the files were recognised as a recorded sample case. */
  sampleCase: string | null;
}

/** Local files: live when a key is configured, otherwise replayed if they are a recorded sample case. */
export async function runFiles(args: FileArgs, mode: Mode, env: Record<string, string | undefined> = process.env): Promise<FileRun> {
  const entries: { kind: DocKind; path: string }[] = [
    { kind: "po", path: args.order ?? "" },
    { kind: "delivery", path: args.delivery_note ?? "" },
    { kind: "invoice", path: args.invoice },
  ].filter((e) => e.path.trim() !== "") as { kind: DocKind; path: string }[];
  const files = entries.map((e) => ({ kind: e.kind, ...readLocalFile(e.path) }));

  if (mode === "replay") {
    const sample = sampleForFiles(files);
    if (!sample) {
      throw new ReplayMissError(
        "These documents were not recorded, and this server has no Clocked API key, so nothing was sent anywhere. " +
          "Replay mode answers the five recorded sample cases (list_sample_cases). " +
          `To check your own documents, set CLOCKED_API_KEY in the server's environment; live runs stop at the credit cap (CLOCKED_CREDIT_CAP, default ${liveBudget(env).cap}).`,
      );
    }
    return { result: await runSample(sample), sampleCase: sample };
  }

  const body: UploadBody = {
    mode: "upload",
    supplierId: args.supplier_id ?? null,
    documents: files.map((f) => ({ kind: f.kind, fileName: f.fileName, mime: f.mime, data: f.data })),
  };
  const input = buildInput(body);
  const budget = liveBudget(env);
  const reserve = budget.reserveFor("pipeline");
  if (budget.stopped || budget.remaining < reserve) {
    throw new ClockedError(
      "budget",
      "pipeline",
      budget.stopped ?? `Not started: ${budget.remaining} credits left under the cap of ${budget.cap}, and reading one document reserves up to ${reserve}.`,
    );
  }
  const calls: CallRecord[] = [];
  const concurrency = Number(env.CLOCKED_CONCURRENCY ?? "1");
  const client = new ClockedClient({
    transport: httpTransport(env.CLOCKED_API_KEY?.trim()),
    budget,
    concurrency: Number.isFinite(concurrency) ? Math.min(Math.max(concurrency, 1), 4) : 1,
    onCall: (c) => calls.push(c),
  });
  const result = await runInput(input, client, calls, { kind: "live", recordedAt: new Date().toISOString(), model: null });
  return { result, sampleCase: null };
}
