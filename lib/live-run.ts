import fs from "node:fs";
import path from "node:path";
import { CreditBudget, MemoryLedger, type LedgerStore } from "./clocked/budget";
import { ClockedClient, httpTransport, type CallRecord } from "./clocked/client";
import { FileLedger } from "./clocked/ledger-file";
import { hasApiKey } from "./clocked/live";
import { DATA_DIR, listCaseIds, loadCase, loadSupplier } from "./cases";
import { reconcile, type RunEvent } from "./engine/run";
import { IMAGE_MIMES, type CaseInput, type DocKind, type ImageMime, type InputDocument, type SupplierMaster } from "./engine/types";

/**
 * Server-side live runs, with guardrails for a public deployment:
 *  - off unless the server has CLOCKED_API_KEY, and in production also LIVE_RUNS=1;
 *  - one live run at a time per server, and a per-IP limit;
 *  - the same hard credit cap as the scripts (CLOCKED_CREDIT_CAP);
 *  - uploads validated (magic bytes, ~2.5 MB per PDF, 2.4 MB per photo, 60k characters per text file).
 */

export function liveStatus(env = process.env): { live: boolean; reason: string | null } {
  if (!hasApiKey(env)) return { live: false, reason: "This server has no Clocked API key." };
  if (env.NODE_ENV === "production" && env.LIVE_RUNS !== "1") return { live: false, reason: "Live runs are switched off on this deployment." };
  return { live: true, reason: null };
}

let ledger: LedgerStore | null = null;
let budget: CreditBudget | null = null;
function serverBudget(): CreditBudget {
  if (!budget) {
    const dir = path.join(process.cwd(), ".clocked");
    try {
      fs.mkdirSync(dir, { recursive: true });
      ledger = new FileLedger(path.join(dir, "ledger.jsonl"));
    } catch {
      ledger = new MemoryLedger(); // read-only filesystem (serverless): cap per instance
    }
    budget = CreditBudget.fromEnv(process.env, ledger);
  }
  return budget;
}

let running = false;
const recent = new Map<string, number[]>();
const MAX_RUNS_PER_WINDOW = 6;
const WINDOW_MS = 10 * 60 * 1000;

export function admit(ip: string): string | null {
  if (running) return "Another live run is in progress. Try again in a few seconds.";
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_RUNS_PER_WINDOW) return "Live run limit reached for now (6 per 10 minutes). Recorded cases are always available.";
  list.push(now);
  recent.set(ip, list);
  return null;
}

const MAX_PDF_BYTES = 2_500_000;
const MAX_TEXT_CHARS = 60_000;
/** Clocked's limit for the images of one request, decoded. */
const MAX_IMAGE_BYTES = 2_400_000;

/** True when the bytes really are the image type claimed (JPEG, PNG or WebP). */
export function imageMagicOk(bytes: Buffer, mime: ImageMime): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
}
const KINDS: DocKind[] = ["po", "delivery", "invoice"];
const LABELS: Record<DocKind, string> = { po: "Order", delivery: "Delivery note", invoice: "Invoice" };

export interface UploadBody {
  mode: "upload";
  supplierId: string | null;
  documents: { kind: DocKind; fileName: string; mime: string; data: string }[];
}
export interface SampleBody {
  mode: "sample";
  caseId: string;
}

const EMPTY_SUPPLIER: SupplierMaster = {
  id: "none",
  name: "Supplier (no record on file)",
  taxId: "",
  phoneOnFile: "the number you already have",
  ibanOnFile: "",
  paymentTerms: "",
  tariff: { name: "No agreed tariff on file", validity: "", products: [] },
  tariffText: "No agreed tariff on file.",
};

export function buildInput(body: UploadBody | SampleBody): CaseInput {
  if (body.mode === "sample") {
    if (!listCaseIds().includes(body.caseId)) throw new Error("Unknown sample case.");
    return loadCase(body.caseId);
  }
  const docs: InputDocument[] = [];
  const seen = new Set<DocKind>();
  for (const d of body.documents ?? []) {
    if (!KINDS.includes(d.kind) || seen.has(d.kind)) throw new Error("Send at most one file per document type.");
    seen.add(d.kind);
    const name = String(d.fileName ?? "file").slice(0, 120);
    if (d.mime === "application/pdf") {
      const bytes = Buffer.from(String(d.data ?? ""), "base64");
      if (bytes.length > MAX_PDF_BYTES) throw new Error(`${name}: PDFs up to about 2.5 MB fit the API.`);
      if (!bytes.subarray(0, 1024).toString("latin1").includes("%PDF-")) throw new Error(`${name} is not a PDF.`);
      docs.push({ kind: d.kind, label: LABELS[d.kind], fileName: name, mime: "application/pdf", data: bytes.toString("base64") });
    } else if (d.mime === "text/plain") {
      const text = String(d.data ?? "");
      if (!text.trim()) throw new Error(`${name} is empty.`);
      if (text.length > MAX_TEXT_CHARS) throw new Error(`${name}: text files up to 60,000 characters.`);
      docs.push({ kind: d.kind, label: d.kind === "po" ? "Order" : LABELS[d.kind], fileName: name, mime: "text/plain", data: text });
    } else if ((IMAGE_MIMES as readonly string[]).includes(d.mime)) {
      // Photos are read for delivery notes and orders. An invoice must be a PDF with a text
      // layer, so every number that gets paid points to the line it was printed on.
      if (d.kind === "invoice") throw new Error(`${name}: send the invoice as a PDF. Photos are read for delivery notes and orders.`);
      const bytes = Buffer.from(String(d.data ?? ""), "base64");
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${name}: photos up to 2.4 MB (Clocked's image limit). Resize it and try again.`);
      if (!imageMagicOk(bytes, d.mime as ImageMime)) throw new Error(`${name} is not a ${d.mime.slice(6).toUpperCase()} image.`);
      docs.push({
        kind: d.kind,
        label: d.kind === "po" ? "Order (photo)" : `${LABELS[d.kind]} (photo)`,
        fileName: name,
        mime: d.mime as ImageMime,
        data: bytes.toString("base64"),
      });
    } else {
      throw new Error(`${name}: use a PDF, a photo (JPEG, PNG or WebP) of a delivery note or order, or a .txt file (for example a WhatsApp export).`);
    }
  }
  if (!seen.has("invoice")) throw new Error("An invoice is required.");
  let supplier = EMPTY_SUPPLIER;
  if (body.supplierId) {
    if (!/^[a-z0-9-]+$/.test(body.supplierId) || !fs.existsSync(path.join(DATA_DIR, "suppliers", `${body.supplierId}.json`))) {
      throw new Error("Unknown supplier record.");
    }
    supplier = loadSupplier(body.supplierId);
  }
  return {
    id: "upload",
    title: "Your documents",
    restaurant: "Taberna La Encina",
    supplier,
    documents: KINDS.map((k) => docs.find((d) => d.kind === k)).filter((d): d is InputDocument => Boolean(d)),
    history: [],
  };
}

export async function runLive(input: CaseInput, emit: (e: RunEvent) => void): Promise<void> {
  running = true;
  try {
    const calls: CallRecord[] = [];
    const client = new ClockedClient({
      transport: httpTransport(process.env.CLOCKED_API_KEY?.trim()),
      budget: serverBudget(),
      concurrency: Math.min(Math.max(Number(process.env.CLOCKED_CONCURRENCY ?? "1") || 1, 1), 4),
      onCall: (c) => {
        calls.push(c);
        emit({ type: "call", call: c });
      },
    });
    await reconcile(client, input, { calls, source: { kind: "live", recordedAt: new Date().toISOString(), model: null }, onEvent: emit });
  } finally {
    running = false;
  }
}
