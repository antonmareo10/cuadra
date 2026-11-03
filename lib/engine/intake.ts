import type { ClockedClient } from "../clocked/client";
import { ClockedError } from "../clocked/errors";
import { parseDocNumber } from "../money";
import { findPdfScripts } from "./pdf-scripts";
import { inspectRequest, intakePipeline, piiRequest, sanitizedExtract } from "./requests";
import { blankRanges, sliceCp } from "./text";
import type {
  FieldRead,
  GuardResult,
  InputDocument,
  InspectResult,
  LineRead,
  PiiFinding,
  ReadDocument,
  ReturnRead,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toFieldRead(f: any): FieldRead {
  if (!f || typeof f !== "object") return { value: typeof f === "string" ? f : null };
  const value = typeof f.value === "string" ? f.value : f.value === null || f.value === undefined ? null : String(f.value);
  const read: FieldRead = { value };
  if (Number.isInteger(f.start) && Number.isInteger(f.end)) {
    read.start = f.start;
    read.end = f.end;
  }
  if (typeof f.confidence === "number") read.confidence = f.confidence;
  const normalizedAmount = f.normalized?.value?.amount ?? (typeof f.normalized?.value === "number" ? f.normalized.value : undefined);
  const fromNormalized = normalizedAmount !== undefined ? Number(normalizedAmount) : NaN;
  read.number = Number.isFinite(fromNormalized) ? fromNormalized : parseDocNumber(value);
  return read;
}

/** Records field → one object of FieldReads per record, with spans when the API returned items. */
export function toRecords(field: any, columns: string[]): { start?: number; end?: number; cells: Record<string, FieldRead> }[] {
  if (!field) return [];
  const items: any[] = Array.isArray(field.items) ? field.items : [];
  const values: any[] = Array.isArray(field.value) ? field.value : [];
  const n = Math.max(items.length, values.length);
  const out: { start?: number; end?: number; cells: Record<string, FieldRead> }[] = [];
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const cells: Record<string, FieldRead> = {};
    for (const col of columns) {
      const cell = item?.fields?.[col];
      cells[col] = cell ? toFieldRead(cell) : toFieldRead({ value: values[i]?.[col] ?? null });
    }
    out.push({ start: item?.start, end: item?.end, cells });
  }
  return out;
}

export function toList(field: any): FieldRead[] {
  if (!field) return [];
  const items: any[] = Array.isArray(field.items) ? field.items : [];
  if (items.length) return items.map(toFieldRead).filter((r) => r.value);
  const values: any[] = Array.isArray(field.value) ? field.value : [];
  return values.filter((v) => typeof v === "string" && v.trim()).map((v) => ({ value: v }));
}

function parseGuard(r: any): GuardResult {
  return {
    verdict: String(r?.verdict ?? "unknown"),
    injection: Number(r?.injection ?? 0),
    category: String(r?.category ?? ""),
    severity: String(r?.severity ?? ""),
    evidence: Array.isArray(r?.evidence)
      ? r.evidence
          .filter((e: any) => Number.isInteger(e?.start) && Number.isInteger(e?.end))
          .map((e: any) => ({ quote: String(e.quote ?? ""), start: e.start, end: e.end, confidence: Number(e.confidence ?? 0) }))
      : [],
    flagged: r?.verdict !== undefined && r.verdict !== "benign",
  };
}

function parseInspect(r: any): InspectResult {
  return {
    verdict: String(r?.verdict ?? "unknown"),
    malicious: Number(r?.malicious ?? 0),
    suspicious: Number(r?.suspicious ?? 0),
    category: String(r?.category ?? ""),
    severity: String(r?.severity ?? ""),
    evidence: Array.isArray(r?.evidence)
      ? r.evidence.map((e: any) => ({ line: String(e.line ?? ""), start: Number(e.start ?? 0), end: Number(e.end ?? 0) }))
      : [],
    flagged: r?.verdict !== undefined && r.verdict !== "benign",
  };
}

function applyExtraction(doc: ReadDocument, result: any) {
  const f = result?.fields ?? {};
  const header: Record<string, FieldRead> = {};
  for (const [key, val] of Object.entries(f)) {
    if (key === "lines" || key === "returns" || key === "notes") continue;
    header[key] = toFieldRead(val);
  }
  doc.header = header;

  if (doc.kind === "po") {
    doc.lines = toRecords(f.lines, ["product", "quantity", "unit", "agreed_price"]).map(
      (r, index): LineRead => ({
        index,
        start: r.start,
        end: r.end,
        code: { value: null },
        description: r.cells.product,
        quantity: r.cells.quantity,
        unit: r.cells.unit,
        unitPrice: r.cells.agreed_price,
        vatRate: { value: null },
        amount: { value: null },
      }),
    );
  } else {
    const cols =
      doc.kind === "invoice"
        ? ["code", "description", "quantity", "unit", "unit_price", "vat_rate", "amount"]
        : ["code", "description", "quantity", "unit"];
    doc.lines = toRecords(f.lines, cols).map(
      (r, index): LineRead => ({
        index,
        start: r.start,
        end: r.end,
        code: r.cells.code,
        description: r.cells.description,
        quantity: r.cells.quantity,
        unit: r.cells.unit,
        unitPrice: r.cells.unit_price ?? { value: null },
        vatRate: r.cells.vat_rate ?? { value: null },
        amount: r.cells.amount ?? { value: null },
      }),
    );
  }
  doc.lines = doc.lines.filter((l) => l.description.value || l.code.value);
  doc.returns = toRecords(f.returns, ["product", "quantity", "reason"])
    .map((r): ReturnRead => ({ product: r.cells.product, quantity: r.cells.quantity, reason: r.cells.reason }))
    .filter((r) => r.product.value);
  doc.notes = toList(f.notes);
}


const REPAIR_FIELDS: Record<string, { key: keyof LineRead; def: Record<string, unknown> }[]> = {
  invoice: [
    { key: "quantity", def: { description: "the quantity (Cantidad)", format: "number" } },
    { key: "unitPrice", def: { description: "the unit price before VAT (Precio)", format: "number" } },
    { key: "vatRate", def: { description: "the VAT percentage (IVA)", format: "number" } },
    { key: "amount", def: { description: "the line amount, the last number (Importe)", format: "number" } },
  ],
  delivery: [{ key: "quantity", def: { description: "the quantity delivered (Cantidad)", format: "number" } }],
  po: [{ key: "quantity", def: { description: "the quantity ordered" } }],
};

/**
 * A records read can leave a cell empty. Each line with a missing number is
 * re-read on its own span (Extract over that line only), and the offsets are
 * shifted back into the document. Missing stays missing if the line does not
 * state it: nothing is guessed.
 */
async function repairLines(client: ClockedClient, doc: ReadDocument): Promise<void> {
  const wanted = REPAIR_FIELDS[doc.kind] ?? [];
  for (const line of doc.lines) {
    const missing = wanted.filter((w) => (line[w.key] as FieldRead).number == null);
    if (!missing.length || line.start === undefined || line.end === undefined) continue;
    const slice = sliceCp(doc.text, line.start, line.end);
    const fields = Object.fromEntries(missing.map((m) => [m.key, m.def]));
    try {
      const { data } = await client.call<any>(
        "extract",
        { text: slice, fields, instructions: "One line of a Spanish supplier document. Amounts use a decimal comma." },
        `Extract (re-read line ${line.index + 1}) · ${doc.label}`,
      );
      for (const m of missing) {
        const r = toFieldRead(data?.fields?.[m.key]);
        if (r.start !== undefined && r.end !== undefined) {
          r.start += line.start;
          r.end += line.start;
        }
        if (r.value !== null) {
          (line as unknown as Record<string, FieldRead>)[m.key] = r;
          doc.repairs++;
        }
      }
    } catch {
      /* the line stays partially read; checks treat missing numbers as unknown */
    }
  }
}

function readability(doc: ReadDocument) {
  if (doc.lines.length === 0) doc.problems.push("No product lines could be read.");
  if (doc.kind === "invoice" && !doc.header.total?.value) doc.problems.push("No invoice total could be read.");
  if (doc.kind === "invoice" && !doc.header.number?.value) doc.problems.push("No invoice number could be read.");
  doc.readable = doc.lines.length > 0 && (doc.kind !== "invoice" || Boolean(doc.header.total?.value));
}

/**
 * Reads one document:
 *   1. Protect (/pii) on the original file: personal data, a share-safe copy, and
 *      the PDF's text layer (return_text) that every later offset indexes.
 *   2. Embedded scripts → Inspect (/script), only when a script exists.
 *   3. Pipeline: Guard (/injection, stop: true) then Extract. A flagged document is
 *      re-read by Extract with the flagged lines blanked out.
 */
export async function readDocument(client: ClockedClient, input: InputDocument): Promise<ReadDocument> {
  const isPdf = input.mime === "application/pdf";
  const doc: ReadDocument = {
    kind: input.kind,
    label: input.label,
    fileName: input.fileName,
    mime: input.mime,
    text: isPdf ? "" : input.data,
    mode: isPdf ? "text" : "plain",
    pages: 1,
    pageOffsets: [0],
    pii: [],
    guard: null,
    sanitized: false,
    scripts: [],
    inspect: null,
    header: {},
    lines: [],
    returns: [],
    notes: [],
    readable: false,
    problems: [],
    repairs: 0,
  };

  // 1. Protect: personal data + text layer
  try {
    const { data } = await client.call<any>("pii", piiRequest(input), `Protect · ${input.label}`);
    doc.pii = (Array.isArray(data?.entities) ? data.entities : [])
      .filter((e: any) => Number.isInteger(e?.start))
      .map((e: any): PiiFinding => ({ type: e.type, value: e.value, start: e.start, end: e.end, confidence: Number(e.confidence ?? 0) }));
    doc.anonymizedText = typeof data?.anonymized_text === "string" ? data.anonymized_text : undefined;
    if (isPdf) {
      doc.mode = data?.pdf?.mode === "image" ? "image" : "text";
      doc.pages = Number(data?.pdf?.pages ?? 1);
      doc.pageOffsets = Array.isArray(data?.pdf?.page_offsets) ? data.pdf.page_offsets : [0];
      doc.text = typeof data?.pdf?.text === "string" ? data.pdf.text : "";
      const marked = data?.pdf?.marked;
      if (typeof marked?.document === "string") doc.redactedPdf = marked.document;
    }
  } catch (err) {
    doc.problems.push(`Protect could not read the file: ${err instanceof ClockedError ? err.userMessage : String(err)}`);
  }

  if (isPdf && doc.mode === "image") {
    doc.problems.push("This PDF is a scan without a text layer. This version reads typed PDFs; scanned pages are not reconciled.");
    return doc;
  }
  if (!doc.text.trim()) {
    if (!doc.problems.length) doc.problems.push("The document has no readable text.");
    return doc;
  }

  // 2. Embedded scripts → Inspect
  if (isPdf) {
    doc.scripts = await findPdfScripts(input.data);
    if (doc.scripts.length) {
      try {
        const script = doc.scripts.map((s) => `// ${s.location}\n${s.script}`).join("\n\n");
        const { data } = await client.call<any>("script", inspectRequest(script), `Inspect · ${input.label} scripts`);
        doc.inspect = parseInspect(data);
      } catch (err) {
        doc.problems.push(`Inspect failed: ${err instanceof ClockedError ? err.userMessage : String(err)}`);
      }
    }
  }

  // 3. Guard + Extract in one pipeline
  const plain = !isPdf;
  try {
    const { data } = await client.call<any>("pipeline", intakePipeline(doc.text, doc.kind, plain), `Guard + Extract · ${input.label}`);
    const steps: any[] = Array.isArray(data?.steps) ? data.steps : [];
    const guardStep = steps.find((s) => s.endpoint === "injection");
    const readStep = steps.find((s) => s.endpoint === "extract");
    if (guardStep?.result) doc.guard = parseGuard(guardStep.result);
    else if (guardStep?.error) doc.problems.push(`Guard failed: ${JSON.stringify(guardStep.error).slice(0, 200)}`);

    if (data?.stopped || doc.guard?.flagged) {
      const ranges = doc.guard?.evidence.length ? doc.guard.evidence : [];
      const cleaned = ranges.length ? blankRanges(doc.text, ranges) : doc.text;
      doc.sanitized = ranges.length > 0;
      const { data: ex } = await client.call<any>("extract", sanitizedExtract(cleaned, doc.kind, plain), `Extract (flagged passage removed) · ${input.label}`);
      applyExtraction(doc, ex);
    } else if (readStep?.result) {
      applyExtraction(doc, readStep.result);
    } else if (readStep?.error) {
      doc.problems.push(`Extract failed: ${JSON.stringify(readStep.error).slice(0, 200)}`);
    }
  } catch (err) {
    doc.problems.push(`Reading failed: ${err instanceof ClockedError ? err.userMessage : String(err)}`);
  }

  if (doc.lines.length) await repairLines(client, doc);
  readability(doc);
  return doc;
}
