import type { CallRecord, Endpoint } from "../clocked/client";

export type DocKind = "po" | "delivery" | "invoice";

export const DOC_LABEL: Record<DocKind, string> = {
  po: "Purchase order",
  delivery: "Delivery note",
  invoice: "Invoice",
};

export interface InputDocument {
  kind: DocKind;
  label: string;
  fileName: string;
  mime: "application/pdf" | "text/plain";
  /** base64 for PDFs, UTF-8 text for text files */
  data: string;
}

export interface TariffProduct {
  code: string;
  name: string;
  unit: string;
  price: number;
  vat: number;
}

export interface SupplierMaster {
  id: string;
  name: string;
  taxId: string;
  phoneOnFile: string;
  ibanOnFile: string;
  paymentTerms: string;
  tariff: { name: string; validity: string; products: TariffProduct[] };
  tariffText: string;
}

export interface HistoryInvoice {
  number: string;
  date: string;
  status: string;
  text: string;
}

export interface CaseInput {
  id: string;
  title: string;
  story?: string;
  restaurant: string;
  supplier: SupplierMaster;
  documents: InputDocument[];
  history: HistoryInvoice[];
}

/** A verbatim value read by Extract, with code-point offsets into the document text. */
export interface FieldRead {
  value: string | null;
  start?: number;
  end?: number;
  confidence?: number;
  /** Number parsed from the span (Extract `normalized` when present, otherwise our parser). */
  number?: number | null;
}

export interface LineRead {
  index: number;
  start?: number;
  end?: number;
  code: FieldRead;
  description: FieldRead;
  quantity: FieldRead;
  unit: FieldRead;
  unitPrice: FieldRead;
  vatRate: FieldRead;
  amount: FieldRead;
}

export interface ReturnRead {
  product: FieldRead;
  quantity: FieldRead;
  reason: FieldRead;
}

export interface PiiFinding {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface GuardResult {
  verdict: string;
  injection: number;
  category: string;
  severity: string;
  evidence: { quote: string; start: number; end: number; confidence: number }[];
  flagged: boolean;
}

export interface ScriptFinding {
  location: string;
  script: string;
}

export interface InspectResult {
  verdict: string;
  malicious: number;
  suspicious: number;
  category: string;
  severity: string;
  evidence: { line: string; start: number; end: number }[];
  flagged: boolean;
}

export interface ReadDocument {
  kind: DocKind;
  label: string;
  fileName: string;
  mime: InputDocument["mime"];
  text: string;
  mode: "text" | "plain" | "image";
  pages: number;
  pageOffsets: number[];
  pii: PiiFinding[];
  anonymizedText?: string;
  /** Clocked's redacted copy of the PDF (base64), when the document is a PDF. */
  redactedPdf?: string;
  guard: GuardResult | null;
  /** True when the document was re-read with the flagged passage blanked out. */
  sanitized: boolean;
  scripts: ScriptFinding[];
  inspect: InspectResult | null;
  header: Record<string, FieldRead>;
  lines: LineRead[];
  returns: ReturnRead[];
  notes: FieldRead[];
  readable: boolean;
  problems: string[];
  /** Cells re-read inside their own line after the first read left them empty. */
  repairs: number;
}

export interface RerankLevels {
  answers: number;
  elsewhere: number;
  different_case: number;
  unrelated: number;
}

export interface LineCandidate {
  index: number; // PO line index
  action: "use" | "expand" | "skip";
  reason?: string;
  relevance: number;
  levels: RerankLevels;
}

export interface LineMatch {
  invoiceLine: number;
  /** Product name used for matching and display (invoice text, else delivery note, else tariff). */
  name: string;
  deliveryLine: number | null;
  deliveryBy: "code" | "rerank" | null;
  poLine: number | null;
  poCandidates: LineCandidate[];
  tariffCode: string | null;
  /** Rerank result when the best PO candidate was judged a different product. */
  closestDifferent: LineCandidate | null;
}

export type IssueType =
  | "billed_not_delivered"
  | "returned_at_delivery"
  | "price_above_agreed"
  | "vat_rate_wrong"
  | "line_math"
  | "totals_math"
  | "not_ordered"
  | "ordered_not_delivered"
  | "documents_disagree"
  | "duplicate_invoice"
  | "bank_details_changed"
  | "injection"
  | "active_content"
  | "unreadable";

export type IssueClass = "money" | "review" | "stop" | "info";

export interface Evidence {
  doc: DocKind | "history" | "tariff" | "checks" | "claim";
  quote: string;
  start?: number;
  end?: number;
  by: string; // endpoint or check that produced it
}

export type Resolution = "accept" | "credit_note" | "confirm" | "hold";

export interface IssueDecision {
  action: Resolution;
  probabilities: Record<string, number>;
  confidence: number;
  priority: number; // 0..2 probability-weighted
  priorityLabel: string;
  uncertain: boolean;
}

export interface Issue {
  id: string;
  type: IssueType;
  cls: IssueClass;
  title: string;
  detail: string;
  /** EUR including VAT that should not be paid until resolved (0 when nothing is at stake). */
  amount: number;
  invoiceLine?: number;
  product?: string;
  math?: string;
  evidence: Evidence[];
  sources: string[];
  decision?: IssueDecision;
  /** Default resolution: policy for stops, Decide's action otherwise. */
  resolution: Resolution;
}

export interface DocRelation {
  a: string;
  b: string;
  relation: string;
  probabilities: Record<string, number>;
  conflicts: { kind: string; a: Evidence; b: Evidence; confidence: number }[];
  duplicates: number;
}

export interface VerifiedClaim {
  claim: string;
  verdict: string;
  supported: number;
  contradicted: number;
  notStated: number;
  evidence?: { document: string; quote: string };
}

export interface FilledRecord {
  recommendedStatus: { value: string | null; probabilities: Record<string, number> };
  creditNoteNeeded: { value: boolean | null; probability: number | null };
  expenseCategory: { value: string | null; probabilities: Record<string, number> };
  emailToSupplier: string | null;
  ownerSummary: string | null;
  emailCheck: { verdict: string; grounded: number; claims: VerifiedClaim[] } | null;
}

export interface SupplierClaimCheck {
  text: string;
  verdict: string;
  claims: VerifiedClaim[];
}

export interface Verdict {
  kind: "ready" | "pay_adjusted" | "hold" | "unreadable";
  headline: string;
  invoiceTotal: number | null;
  payNow: number;
  disputed: number;
  pending: number;
  /** Independent recomputation of what should be paid, as a cross-check. */
  expectedPayable: number | null;
}

export interface RunStep {
  id: "intake" | "match" | "checks" | "relations" | "judge" | "record";
  title: string;
  endpoints: Endpoint[];
  status: "done" | "skipped" | "failed";
  note: string;
}

export interface RunResult {
  caseId: string;
  title: string;
  story?: string;
  supplier: {
    name: string;
    taxId: string;
    phoneOnFile: string;
    ibanOnFileTail: string;
    paymentTerms: string;
    tariff: { name: string; validity: string; products: TariffProduct[] };
  };
  source: { kind: "recorded" | "live"; recordedAt: string; model: string | null };
  documents: ReadDocument[];
  matches: LineMatch[];
  issues: Issue[];
  relations: DocRelation[];
  record: FilledRecord | null;
  supplierClaim: SupplierClaimCheck | null;
  verdict: Verdict;
  steps: RunStep[];
  calls: CallRecord[];
  totals: { credits: number; modelMs: number; wallMs: number; calls: number };
  errors: string[];
}
