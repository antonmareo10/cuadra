import type { DocKind, Evidence, Issue, RunResult } from "../engine/types";
import { eur } from "../money";
import { lineAround, type LineQuote } from "./lines";

/**
 * The two findings on the landing page, taken from the recorded runs at build time so the
 * page cannot drift from what Clocked actually returned. Each source line is the verbatim
 * line of the document's text layer that contains the evidence span.
 */

export interface ProofSource extends LineQuote {
  doc: string;
  note?: string;
  by: string;
}

export interface ProofItem {
  caseId: string;
  tone: "warn" | "stop";
  kicker: string;
  title: string;
  result: string;
  sources: ProofSource[];
  outcome: string;
}

const DOC_LABEL: Record<DocKind, string> = { invoice: "Invoice", delivery: "Delivery note", po: "Order" };

function source(run: RunResult, e: Evidence | undefined, maxMatch = 80, note?: string): ProofSource | null {
  if (!e || e.start === undefined || e.end === undefined || !(e.doc in DOC_LABEL)) return null;
  const doc = run.documents.find((d) => d.kind === e.doc);
  if (!doc) return null;
  const q = lineAround(doc.text, e.start, e.end);
  const long = Array.from(q.match).length > maxMatch;
  return {
    ...q,
    match: long ? `${Array.from(q.match).slice(0, maxMatch).join("").trimEnd()}…` : q.match,
    after: long ? "" : q.after,
    doc: DOC_LABEL[e.doc as DocKind],
    by: e.by,
    note,
  };
}

const firstSpan = (i: Issue, doc: DocKind, by?: string) =>
  i.evidence.find((e) => e.doc === doc && e.start !== undefined && e.quote.length <= 160 && (!by || e.by === by));

/** "Right amount": the largest quantity claim, shown on the invoice line and the delivery-note line. */
export function amountProof(run: RunResult): ProofItem | null {
  const issue = run.issues
    .filter((i) => i.type === "billed_not_delivered" && i.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];
  if (!issue) return null;
  const inv = source(run, firstSpan(issue, "invoice", "Extract"));
  const dn = source(run, firstSpan(issue, "delivery", "Extract"), 80, "signed for in the kitchen");
  if (!inv || !dn) return null;
  const v = run.verdict;
  return {
    caseId: run.caseId,
    tone: "warn",
    kicker: "Right amount",
    title: issue.title,
    result: `Claim ${eur(issue.amount)}`,
    sources: [inv, dn],
    outcome:
      v.invoiceTotal !== null
        ? `Pay ${eur(v.payNow)} now instead of the printed ${eur(v.invoiceTotal)}. ${run.issues.filter((i) => i.cls !== "info").length} findings in all.`
        : `Pay ${eur(v.payNow)} now.`,
  };
}

/** "Right account": a new IBAN plus hidden instructions for AI assistants on an invoice that otherwise adds up. */
export function accountProof(run: RunResult): ProofItem | null {
  const iban = run.issues.find((i) => i.type === "bank_details_changed");
  const injection = run.issues.find((i) => i.type === "injection");
  if (!iban || !injection) return null;
  const a = source(run, firstSpan(iban, "invoice"), 80, `IBAN on file ends ${run.supplier.ibanOnFileTail.replace(/\D/g, "")}`);
  const b = source(run, firstSpan(injection, "invoice", "Guard"), 64, "white text, 1 point");
  if (!a || !b) return null;
  const total = run.verdict.invoiceTotal;
  return {
    caseId: run.caseId,
    tone: "stop",
    kicker: "Right account",
    title: "Every line adds up, but the bank account is new",
    result: "Hold payment",
    sources: [a, b],
    outcome: `${total !== null ? `${eur(total)} held. ` : ""}Guard flags the hidden note, Protect finds the new IBAN, and only you can clear the hold.`,
  };
}
