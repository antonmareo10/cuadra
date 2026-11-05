import type { ClockedClient } from "../clocked/client";
import { ClockedError } from "../clocked/errors";
import { parseDocNumber } from "../money";
import { findPdfScripts } from "./pdf-scripts";
import { imageSource, inspectRequest, intakePipeline, photoExtractRequest, photoGuardRequest, piiRequest, sanitizedExtract, type ImageSource } from "./requests";
import { blankRanges, sliceCp } from "./text";
import type {
  FieldRead,
  GuardResult,
  InputDocument,
  InspectResult,
  LineRead,
  PhotoRead,
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
    { key: "description", def: { description: "the product name (Descripción)" } },
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
    const missing = wanted.filter((w) => (w.key === "description" ? (line[w.key] as FieldRead).value : (line[w.key] as FieldRead).number) == null);
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

/** Splits one " | "-separated row from an image read. Missing trailing columns stay null. */
export function splitRow(row: string, columns: number): (string | null)[] | null {
  const parts = row.split("|").map((p) => p.trim());
  if (parts.length < Math.min(3, columns)) return null;
  return Array.from({ length: columns }, (_, i) => (parts[i] ? parts[i] : null));
}

const plainRead = (value: string | null): FieldRead => ({ value, number: parseDocNumber(value) });

/** Applies an image-mode Extract result: plain values, no offsets. */
export function applyPhotoExtraction(doc: ReadDocument, result: any) {
  const r = result && typeof result === "object" ? result : {};
  const photo = doc.photo as PhotoRead;
  const header: Record<string, FieldRead> = {};
  for (const [key, val] of Object.entries(r)) {
    if (key === "lines" || key === "returns" || key === "corrections") continue;
    header[key] = plainRead(typeof val === "string" ? val : val == null ? null : String(val));
  }
  doc.header = header;
  const rows: string[] = Array.isArray(r.lines) ? r.lines.filter((x: unknown) => typeof x === "string" && x.trim()) : [];
  doc.lines = [];
  for (const row of rows) {
    const c = splitRow(row, 4);
    if (doc.kind === "po") {
      if (!c || !c[0]) {
        photo.unparsed.push(row);
        continue;
      }
      doc.lines.push({
        index: doc.lines.length,
        code: { value: null },
        description: { value: c[0] },
        quantity: plainRead(c[1]),
        unit: { value: c[2] },
        unitPrice: plainRead(c[3]),
        vatRate: { value: null },
        amount: { value: null },
      });
    } else {
      if (!c || !(c[0] || c[1])) {
        photo.unparsed.push(row);
        continue;
      }
      doc.lines.push({
        index: doc.lines.length,
        code: { value: c[0] },
        description: { value: c[1] },
        quantity: plainRead(c[2]),
        unit: { value: c[3] },
        unitPrice: { value: null },
        vatRate: { value: null },
        amount: { value: null },
      });
    }
  }
  const corrections: string[] = Array.isArray(r.corrections) ? r.corrections.filter((x: unknown) => typeof x === "string") : [];
  photo.corrections = corrections
    .map((row) => splitRow(row, 3))
    .filter((c): c is (string | null)[] => Boolean(c && c[0] && c[2]))
    .map((c) => ({ code: c[0]!, printed: c[1] ?? "", written: c[2]! }));
  const returns: string[] = Array.isArray(r.returns) ? r.returns.filter((x: unknown) => typeof x === "string") : [];
  doc.returns = returns
    .map((row) => splitRow(row, 3))
    .filter((c): c is (string | null)[] => Boolean(c && c[0]))
    .map((c) => ({ product: { value: c[0] }, quantity: plainRead(c[1]), reason: { value: c[2] } }));
  doc.notes = [];
  if (photo.unparsed.length) doc.problems.push(`${photo.unparsed.length} row${photo.unparsed.length === 1 ? "" : "s"} read from the photo could not be split into columns.`);
}

/**
 * A delivery note or an order read from pixels: a phone photo, or a scanned PDF.
 *   1. Guard (/injection) on the image: a photo can carry instructions for AI assistants too.
 *      If it fires, the photo is not read at all (there is no text to blank out).
 *   2. Extract on the image. No offsets come back, so the document is marked as read from
 *      a photo, and the checks hold the payment until the owner has looked at it.
 * Protect is not called on a photo: on an image it can find personal data but cannot blank it out.
 */
async function readFromPixels(client: ClockedClient, doc: ReadDocument, source: ImageSource, how: PhotoRead["source"]): Promise<ReadDocument> {
  doc.mode = "image";
  doc.text = "";
  doc.photo = { source: how, corrections: [], unparsed: [] };
  const what = how === "photo" ? "photo" : "scan";
  try {
    const { data } = await client.call<any>("injection", photoGuardRequest(source), `Guard (${what}) · ${doc.label}`);
    const r = data?.result ?? {};
    const quotes = (Array.isArray(r.evidence) ? r.evidence : [])
      .map((e: any) => (typeof e === "string" ? e : String(e?.quote ?? "")))
      .filter((q: string) => q.trim());
    doc.guard = {
      verdict: String(r.verdict ?? "unknown"),
      injection: 0,
      category: String(r.category ?? ""),
      severity: String(r.severity ?? ""),
      evidence: [],
      flagged: r.verdict !== undefined && r.verdict !== "benign",
      reason: typeof r.reason === "string" ? r.reason : undefined,
      imageQuotes: quotes,
    };
  } catch (err) {
    doc.problems.push(`Guard failed on the ${what}: ${err instanceof ClockedError ? err.userMessage : String(err)}`);
  }
  if (doc.guard?.flagged) {
    doc.problems.push(`Guard found text in the ${what} addressed to an automated assistant, so it was not read.`);
    readability(doc);
    return doc;
  }
  try {
    const { data } = await client.call<any>("extract", photoExtractRequest(source, doc.kind), `Extract (${what}) · ${doc.label}`);
    applyPhotoExtraction(doc, data?.result);
  } catch (err) {
    doc.problems.push(`Reading the ${what} failed: ${err instanceof ClockedError ? err.userMessage : String(err)}`);
  }
  readability(doc);
  return doc;
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
  const isImage = input.mime.startsWith("image/");
  const doc: ReadDocument = {
    kind: input.kind,
    label: input.label,
    fileName: input.fileName,
    mime: input.mime,
    text: isPdf || isImage ? "" : input.data,
    mode: isImage ? "image" : isPdf ? "text" : "plain",
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

  // Photos never go through the text path. Invoices are only accepted as text: an invoice is
  // what gets paid, and every number on it must point to the line it was printed on.
  if (isImage) {
    if (input.kind === "invoice") {
      doc.problems.push("This invoice is a photo. Cuadra only pays invoices it can read with character positions: ask the supplier for the PDF.");
      readability(doc);
      return doc;
    }
    return readFromPixels(client, doc, imageSource(input), "photo");
  }

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
    if (input.kind === "invoice") {
      doc.problems.push("This invoice is a scan without a text layer. Cuadra only pays invoices it can read with character positions: ask the supplier for the PDF.");
      return doc;
    }
    // A scanned delivery note or order: its pages are read as images. Protect's findings on
    // the scan are kept; its text layer is empty.
    return readFromPixels(client, doc, imageSource(input, doc.pages), "scan");
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
