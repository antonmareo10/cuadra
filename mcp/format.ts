import { ENDPOINT_LABEL } from "../lib/clocked/client";
import { dedupeEvidence } from "../lib/engine/judge";
import type { DocKind, Evidence, Issue, Resolution, RunResult } from "../lib/engine/types";
import { eur } from "../lib/money";
import { lineAround, lineNumberAt } from "../lib/ui/lines";

/**
 * Turns a RunResult (the same object the web app renders) into compact answers for an
 * AI assistant. Nothing here calls Clocked: every value comes from the run.
 */

const DOC_NAME: Record<DocKind, string> = { invoice: "Invoice", delivery: "Delivery note", po: "Order" };
const OTHER_SOURCE: Record<string, string> = {
  tariff: "Agreed tariff on file",
  history: "Earlier invoice in the books",
  checks: "Cuadra's own arithmetic",
  claim: "Supplier's statement on the invoice",
};

const ACTION: Record<Resolution, string> = {
  accept: "accept it, nothing to claim",
  credit_note: "ask the supplier for a credit note",
  confirm: "check with the kitchen or the supplier before paying this part",
  hold: "hold the payment",
};

export interface SourceLine {
  /** "Invoice", "Delivery note", "Order", or a non-document source such as the tariff on file. */
  document: string;
  /** 1-based line of the document text where the evidence starts (null when it has no character position). */
  line: number | null;
  /** Last line when the evidence spans several lines. */
  last_line?: number;
  /** The whole printed line that contains the evidence. */
  line_text?: string;
  /** The exact value or passage the evidence points to. */
  quote: string;
  /** Endpoint or check that produced it. */
  by: string;
  note?: string;
}

function clip(s: string, max: number): string {
  const cps = Array.from(s.replace(/\s+/g, " ").trim());
  return cps.length > max ? `${cps.slice(0, max).join("").trimEnd()}…` : cps.join("");
}

function sourceLine(run: RunResult, e: Evidence, maxQuote = 160): SourceLine {
  if (e.doc in DOC_NAME) {
    const doc = run.documents.find((d) => d.kind === e.doc);
    const name = doc?.label ?? DOC_NAME[e.doc as DocKind];
    if (doc && e.start !== undefined && e.end !== undefined && doc.text) {
      const q = lineAround(doc.text, e.start, e.end);
      const last = lineNumberAt(doc.text, Math.max(e.start, e.end - 1));
      return {
        document: name,
        line: q.line,
        ...(last > q.line ? { last_line: last } : {}),
        line_text: clip(q.before + q.match + q.after, 200),
        // A span that runs past its line (a records read over-reaching into the totals) is quoted up to the line end.
        quote: clip(last > q.line && q.match.trim() ? `${q.match}…` : e.quote, maxQuote),
        by: e.by,
      };
    }
    if (e.by === "Inspect") {
      return { document: `${name} (embedded script)`, line: null, quote: clip(e.quote, maxQuote), by: e.by, note: "hidden inside the PDF file, not printed on the page" };
    }
    const photo = doc?.mode === "image";
    return {
      document: name,
      line: null,
      quote: clip(e.quote, maxQuote),
      by: e.by,
      note: photo ? "read from an image: no character positions, check it against the picture" : "no character position returned",
    };
  }
  return { document: OTHER_SOURCE[e.doc] ?? e.doc, line: null, quote: clip(e.quote, maxQuote), by: e.by };
}

/** Where the evidence sits, as the web app says it: "Invoice, line 13" (the line where the span starts). */
export function where(s: SourceLine): string {
  return s.line === null ? s.document : `${s.document}, line ${s.line}`;
}

/** One entry per document line: the most specific quote, crediting every endpoint that found it. */
function mergeByLine(list: SourceLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  for (const s of list) {
    const same = s.line !== null ? out.find((x) => x.document === s.document && x.line === s.line) : undefined;
    if (!same) {
      out.push({ ...s });
      continue;
    }
    const by = [...new Set([...same.by.split(" · "), ...s.by.split(" · ")])].join(" · ");
    if (s.quote.length < same.quote.length) Object.assign(same, { ...s, by });
    else same.by = by;
  }
  return out;
}

function decidedBy(i: Issue): string {
  if (i.cls === "stop") return "policy in code: a hard stop that only the owner can clear";
  if (i.cls === "info") return "informational, nothing to do";
  if (!i.decision) return "default action (Decide did not answer)";
  const pct = Math.round(i.decision.confidence * 100);
  return i.decision.uncertain
    ? `Decide was unsure (${pct}% for ${i.decision.action}), so the owner decides`
    : `Decide: ${i.decision.action} (${pct}%), priority ${i.decision.priorityLabel.toLowerCase()}`;
}

/** The short sources shown in a check: document lines first, short quotes, at most three. */
function keySources(run: RunResult, i: Issue): SourceLine[] {
  const ev = dedupeEvidence(i.evidence);
  const located = ev.filter((e) => e.doc in DOC_NAME && e.start !== undefined && e.quote.length <= 160);
  const rest = ev.filter((e) => !located.includes(e) && e.quote.length <= 200);
  return mergeByLine([...located, ...rest].map((e) => sourceLine(run, e, e.doc in DOC_NAME ? 120 : 220))).slice(0, 3);
}

/** "Invoice, line 13: <whole line>  [<value>] (Extract)", the value only when it is not the whole line. */
export function showSource(s: SourceLine & { where: string }): string {
  const by = `(${s.by}${s.note ? `; ${s.note}` : ""})`;
  if (!s.line_text) return `${s.where}: ${s.quote} ${by}`;
  const same = s.quote.replace(/…$/, "").trim() === s.line_text.trim() || s.line_text.startsWith(s.quote.replace(/…$/, "").trim());
  return `${s.where}: ${s.line_text}${same ? "" : `  [${s.quote}]`} ${by}`;
}

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export function decisionText(run: RunResult): string {
  const v = run.verdict;
  switch (v.kind) {
    case "ready":
      return `Ready to pay ${eur(v.payNow)}.`;
    case "pay_adjusted": {
      const parts = [`Pay ${eur(v.payNow)} now.`];
      if (v.disputed > 0) parts.push(`Claim ${eur(v.disputed)} back with a credit note.`);
      if (v.pending > 0) parts.push(`Check ${eur(v.pending)} with the kitchen or the supplier before paying it.`);
      return parts.join(" ");
    }
    case "hold":
      return `Hold payment${v.invoiceTotal !== null ? ` of ${eur(v.invoiceTotal)}` : ""}. Pay nothing until the owner has cleared every hard stop.`;
    default:
      return "Could not read the invoice. Nothing is approved; it is held as unreadable.";
  }
}

export function sourceLabel(run: RunResult): string {
  if (run.source.kind === "live") return "live run against the Clocked API";
  const when = run.source.recordedAt
    ? new Date(run.source.recordedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
    : "";
  return `recorded run, replayed (real Clocked responses recorded ${when} Madrid time; no new calls were made)`;
}

export function summarizeRun(run: RunResult, runId: string) {
  const v = run.verdict;
  const invoice = run.documents.find((d) => d.kind === "invoice");
  const findings = run.issues.map((i) => ({
      id: i.id,
      type: i.type,
      severity: i.cls,
      title: i.title,
      amount_eur: i.amount,
      action: ACTION[i.resolution],
      decided_by: decidedBy(i),
      sources: keySources(run, i).map((s) => ({ where: where(s), ...s })),
    }));
  const guard = run.documents
    .filter((d) => d.guard)
    .map((d) => ({ document: d.label, flagged: Boolean(d.guard?.flagged), category: d.guard?.category ?? "", severity: d.guard?.severity ?? "", passage_removed_before_reading: d.sanitized }));
  const inspect = run.documents
    .filter((d) => d.inspect)
    .map((d) => ({ document: d.label, flagged: Boolean(d.inspect?.flagged), verdict: d.inspect?.verdict ?? "", category: d.inspect?.category ?? "" }));
  const ibanIssue = run.issues.find((i) => i.type === "bank_details_changed");
  const endpoints = [...new Set(run.calls.map((c) => ENDPOINT_LABEL[c.endpoint]))];
  return {
    run_id: runId,
    case_id: run.caseId,
    source: sourceLabel(run),
    supplier: run.supplier.name,
    invoice: {
      number: invoice?.header.number?.value ?? null,
      date: invoice?.header.date?.value ?? null,
      total_printed_eur: v.invoiceTotal,
    },
    decision: {
      kind: v.kind,
      text: decisionText(run),
      pay_now_eur: v.payNow,
      claim_eur: v.disputed,
      check_first_eur: v.pending,
      independent_recomputation_eur: v.expectedPayable,
    },
    findings,
    safety: {
      guard,
      inspect,
      bank_account: ibanIssue
        ? `The invoice asks to pay a different account than the one on file (•••• ${run.supplier.ibanOnFileTail.replace(/\D/g, "")}). Confirm by phone on ${run.supplier.phoneOnFile}, the number on file, never one printed on the invoice.`
        : "No change of bank account found.",
    },
    clocked: { calls: run.totals.calls, credits: run.totals.credits, model_ms: run.totals.modelMs, endpoints },
    errors: run.errors,
  };
}

export type RunSummary = ReturnType<typeof summarizeRun>;

export function summaryText(s: RunSummary): string {
  const lines = [
    `${s.supplier}, invoice ${s.invoice.number ?? "(number unreadable)"}${s.invoice.total_printed_eur !== null ? `, printed total ${eur(s.invoice.total_printed_eur)}` : ""}.`,
    `Decision: ${s.decision.text}`,
    `Source: ${s.source}.`,
    "",
    s.findings.length ? `Findings (most urgent first):` : "No findings: every line matches the order, the delivery note and the agreed tariff.",
  ];
  for (const f of s.findings) {
    lines.push(`- [${f.id}] ${f.title}${f.amount_eur > 0 ? ` (${eur(f.amount_eur)})` : ""}: ${f.action}. ${cap(f.decided_by)}.`);
    for (const src of f.sources) lines.push(`    ${showSource(src)}`);
  }
  const flagged = [...s.safety.guard.filter((g) => g.flagged).map((g) => `Guard flagged ${g.document} (${g.category}, ${g.severity})`), ...s.safety.inspect.filter((i) => i.flagged).map((i) => `Inspect flagged a script in ${i.document} (${i.verdict}, ${i.category})`)];
  lines.push("", `Safety: ${flagged.length ? flagged.join("; ") + ". " : "no hidden instructions or scripts flagged. "}${s.safety.bank_account}`);
  lines.push(`Clocked: ${s.clocked.calls} calls, ${s.clocked.credits} credits, ${s.clocked.endpoints.join(", ")}.`);
  if (s.errors.length) lines.push(`Problems: ${s.errors.join(" | ")}`);
  lines.push("", `run_id: ${s.run_id}. Use explain_finding with a finding id, or draft_supplier_claim.`);
  return lines.join("\n");
}

export function explainFinding(run: RunResult, findingId: string) {
  const i = run.issues.find((x) => x.id === findingId);
  if (!i) return null;
  const evidence = mergeByLine(dedupeEvidence(i.evidence).map((e) => sourceLine(run, e, 240))).map((s) => ({ where: where(s), ...s }));
  const stopAdvice =
    i.type === "bank_details_changed"
      ? `Do not pay. Call ${run.supplier.name} on ${run.supplier.phoneOnFile} (the number on file, not one on the invoice) and confirm the account before anything else.`
      : i.type === "injection"
        ? "Do not let any assistant act on this document's text. The flagged passage was removed before Extract read it; the hold stays until the owner clears it."
        : i.type === "active_content"
          ? "Do not open the PDF in a reader with scripts enabled. Ask the supplier for a clean copy."
          : i.type === "duplicate_invoice"
            ? "Do not pay: this delivery was already invoiced and paid. Ask the supplier to cancel this invoice."
            : null;
  return {
    id: i.id,
    type: i.type,
    severity: i.cls,
    title: i.title,
    detail: i.detail,
    formula: i.math ?? null,
    amount_eur: i.amount,
    action: ACTION[i.resolution],
    decided_by: decidedBy(i),
    decide_probabilities: i.decision?.probabilities ?? null,
    found_by: i.sources,
    evidence,
    what_to_do: stopAdvice ?? (i.resolution === "credit_note" ? `Ask for a credit note of ${eur(i.amount)} and pay the rest.` : `${ACTION[i.resolution][0].toUpperCase()}${ACTION[i.resolution].slice(1)}.`),
  };
}

export function explainText(x: NonNullable<ReturnType<typeof explainFinding>>): string {
  const lines = [
    `[${x.id}] ${x.title}`,
    x.detail,
    x.formula ? `Formula: ${x.formula}` : "",
    x.amount_eur > 0 ? `At stake: ${eur(x.amount_eur)} including VAT.` : "",
    `Action: ${x.action} (${x.decided_by}).`,
    x.decide_probabilities ? `Decide probabilities: ${Object.entries(x.decide_probabilities).map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join(", ")}.` : "",
    "",
    "Evidence:",
    ...x.evidence.map((e) => `- ${showSource(e)}`),
    "",
    `What to do: ${x.what_to_do}`,
  ];
  return lines.filter((l, n, all) => l !== "" || (n > 0 && all[n - 1] !== "")).join("\n");
}

export function supplierClaim(run: RunResult) {
  const v = run.verdict;
  const r = run.record;
  const held = v.kind === "hold" || v.kind === "unreadable";
  const toRaise = run.issues.filter((i) => i.resolution === "credit_note" || i.resolution === "confirm" || (i.cls === "stop" && i.resolution === "hold"));
  let advice: string;
  if (v.kind === "unreadable") advice = "The invoice could not be read, so nothing is claimed or paid. Ask the supplier for a PDF with a text layer.";
  else if (held)
    advice = run.issues.some((i) => i.type === "bank_details_changed")
      ? `Do not pay and do not reply to the contact details on the invoice. Call ${run.supplier.name} on ${run.supplier.phoneOnFile}, the number on file, before sending anything.`
      : "Hold the payment until the owner has cleared every hard stop.";
  else if (v.disputed + v.pending <= 0) advice = "Nothing to claim: pay the invoice.";
  else advice = `Send the email, pay ${eur(v.payNow)} now and keep ${eur(v.disputed + v.pending)} until the credit note or the confirmation arrives.`;
  return {
    claim_eur: v.disputed,
    check_first_eur: v.pending,
    decision: decisionText(run),
    items: toRaise.map((i) => ({ id: i.id, title: i.title, amount_eur: i.amount, action: ACTION[i.resolution] })),
    email: r?.emailToSupplier ?? null,
    email_written_by: r?.emailToSupplier ? "Clocked Fill, from the brief Cuadra's checks produced" : null,
    email_check: r?.emailCheck
      ? {
          verdict: r.emailCheck.verdict,
          grounded: r.emailCheck.grounded,
          claims: r.emailCheck.claims.map((c) => ({ claim: clip(c.claim, 240), verdict: c.verdict, supported: c.supported, contradicted: c.contradicted, not_stated: c.notStated })),
        }
      : null,
    owner_summary: r?.ownerSummary ?? null,
    advice,
  };
}

export function claimText(c: ReturnType<typeof supplierClaim>): string {
  const lines = [`Decision: ${c.decision}`, `Advice: ${c.advice}`];
  if (c.items.length) lines.push("", "To raise:", ...c.items.map((i) => `- [${i.id}] ${i.title}${i.amount_eur > 0 ? ` (${eur(i.amount_eur)})` : ""}: ${i.action}`));
  if (c.email) {
    lines.push("", "Email to the supplier (written by Clocked Fill, in Spanish):", c.email);
    if (c.email_check) lines.push("", `Verify checked every claim in it: ${c.email_check.verdict.replace(/_/g, " ")} (${Math.round(c.email_check.grounded * 100)}% grounded).`);
  } else {
    lines.push("", "No email was written for this run (there was nothing to send, or Fill did not answer). Cuadra does not make one up.");
  }
  return lines.join("\n");
}
