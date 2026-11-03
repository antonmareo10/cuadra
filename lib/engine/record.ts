import type { ClockedClient } from "../clocked/client";
import { round2 } from "../money";
import { fillRequest, verifyEmailRequest, verifySupplierClaimRequest } from "./requests";
import type { FilledRecord, Issue, ReadDocument, SupplierClaimCheck, SupplierMaster, Verdict, VerifiedClaim } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const e = (n: number) => `${n.toFixed(2)} EUR`;

function parseClaims(data: any): VerifiedClaim[] {
  return (Array.isArray(data?.claims) ? data.claims : [])
    .filter((c: any) => c.counted !== false && c.kind !== "not_a_claim")
    .map((c: any) => ({
      claim: String(c.claim ?? ""),
      verdict: String(c.verdict ?? ""),
      supported: Number(c.supported ?? 0),
      contradicted: Number(c.contradicted ?? 0),
      notStated: Number(c.not_stated ?? 0),
      evidence: c.evidence?.quote ? { document: String(c.evidence.document ?? ""), quote: String(c.evidence.quote) } : undefined,
    }));
}

/**
 * Verify the supplier's own statements on the invoice ("prices updated per the tariff
 * communicated on 15/10") against the restaurant's records. The verdict is attached to
 * the price issues as evidence, so Decide and the owner both see it.
 */
export async function checkSupplierClaims(
  client: ClockedClient,
  invoice: ReadDocument,
  po: ReadDocument | undefined,
  supplier: SupplierMaster,
  issues: Issue[],
): Promise<SupplierClaimCheck | null> {
  const notes = invoice.notes.map((n) => n.value).filter((v): v is string => Boolean(v));
  if (!notes.length) return null;
  const docs = [{ id: "agreed-tariff", text: supplier.tariffText }];
  if (po?.text) docs.push({ id: "order", text: po.text });
  const text = notes.join(" ");
  const { data } = await client.call<any>("grounding", verifySupplierClaimRequest(notes, docs), "Verify · supplier's notes on the invoice");
  const claims = parseClaims(data);
  const result: SupplierClaimCheck = { text, verdict: String(data?.verdict ?? ""), claims };
  const unsupported = claims.filter((c) => c.verdict !== "supported");
  // Route each unsupported statement to the issue it bears on.
  const routes: { type: Issue["type"]; re: RegExp }[] = [
    { type: "price_above_agreed", re: /precio|tarifa|price|tariff/i },
    { type: "bank_details_changed", re: /banc|cuenta|iban|bank|account/i },
  ];
  for (const route of routes) {
    const relevant = unsupported.filter((c) => route.re.test(c.claim));
    if (!relevant.length) continue;
    for (const i of issues.filter((x) => x.type === route.type)) {
      for (const c of relevant) {
        i.evidence.push({
          doc: "claim",
          quote: `“${c.claim}” is ${c.verdict.replace("_", " ")} in the agreed tariff or the order (${Math.round(Math.max(c.notStated, c.contradicted) * 100)}%)`,
          by: "Verify",
        });
      }
      if (!i.sources.includes("Verify")) i.sources.push("Verify");
    }
  }
  return result;
}

/** The facts Fill and Verify work from: produced by the checks, never by a model. */
export function buildBrief(p: {
  restaurant: string;
  owner: string;
  supplier: SupplierMaster;
  invoice: ReadDocument;
  delivery?: ReadDocument;
  po?: ReadDocument;
  issues: Issue[];
  verdict: Verdict;
  claim: SupplierClaimCheck | null;
}): string {
  const h = p.invoice.header;
  const lines: string[] = [
    `Restaurant: ${p.restaurant}. Owner: ${p.owner}.`,
    `Supplier: ${p.supplier.name} (tax ID ${p.supplier.taxId}). Phone on file: ${p.supplier.phoneOnFile}.`,
    `Invoice ${h.number?.value ?? "(number not read)"} dated ${h.date?.value ?? "?"}, printed total ${p.verdict.invoiceTotal !== null ? e(p.verdict.invoiceTotal) : "not read"}.`,
    p.delivery ? `Delivery note ${p.delivery.header.number?.value ?? "?"} dated ${p.delivery.header.date?.value ?? "?"}, signed on delivery.` : "No delivery note.",
    p.po ? `Order: ${p.po.header.number?.value ?? p.po.label} of ${p.po.header.date?.value ?? "?"}.` : "No purchase order.",
    `Goods invoiced: ${p.invoice.lines.map((l) => l.description.value ?? l.code.value).filter(Boolean).join(", ")}.`,
    "",
  ];
  const relevant = p.issues.filter((i) => i.cls !== "info");
  const toRaise = relevant.filter((i) => i.resolution === "credit_note" || i.resolution === "hold");
  const internal = relevant.filter((i) => i.resolution === "confirm");
  const accepted = relevant.filter((i) => i.resolution === "accept");
  const item = (i: Issue) => `${i.title}. ${i.detail}${i.math ? ` Computation: ${i.math}.` : ""}${i.amount > 0 ? ` Amount: ${e(i.amount)} including VAT.` : ""}`;
  lines.push(toRaise.length ? "To raise with the supplier:" : "To raise with the supplier: nothing.");
  toRaise.forEach((i, n) => lines.push(`${n + 1}. ${item(i)} Action: ${i.resolution === "hold" ? "hold the payment" : "request a credit note"}.`));
  if (internal.length) {
    lines.push("Internal, not for the supplier yet (waiting for the kitchen to confirm):");
    for (const i of internal) lines.push(`- ${item(i)}`);
  }
  if (accepted.length) {
    lines.push("Accepted, nothing to raise:");
    for (const i of accepted) lines.push(`- ${i.title}. ${i.detail}`);
  }
  for (const c of p.claim?.claims.filter((x) => x.verdict !== "supported") ?? []) {
    lines.push(
      `The supplier writes on the invoice: "${c.claim}". The restaurant's records (agreed tariff ${p.supplier.tariff.validity.toLowerCase()}, which requires written acceptance of any price change, and the order) do not show this.`,
    );
  }
  lines.push("");
  if (p.verdict.kind === "hold") lines.push("Decision: hold the whole payment until the stops above are cleared with the supplier by phone, using the number on file.");
  else {
    lines.push(`Pay now: ${e(p.verdict.payNow)}.`);
    if (p.verdict.disputed > 0) lines.push(`Credit note to request: ${e(p.verdict.disputed)}.`);
    if (p.verdict.pending > 0) lines.push(`Waiting for kitchen confirmation: ${e(p.verdict.pending)}.`);
  }
  return lines.join("\n");
}

/**
 * Fill writes the reconciliation record (status, credit note yes/no, bookkeeping
 * category, a summary for the owner and, when there is something to raise, the email
 * to the supplier). Verify then checks every claim of that email against the documents
 * and the checks before the owner can copy it.
 */
export async function fillRecord(
  client: ClockedClient,
  p: Parameters<typeof buildBrief>[0],
): Promise<{ record: FilledRecord; brief: string }> {
  const brief = buildBrief(p);
  const withEmail = p.issues.some((i) => i.cls !== "info" && (i.resolution === "credit_note" || i.resolution === "hold"));
  const { data } = await client.call<any>("fill", fillRequest(brief, withEmail, p.owner, p.restaurant), "Fill · reconciliation record");
  const f = data?.fields ?? {};
  const record: FilledRecord = {
    recommendedStatus: { value: f.recommended_status?.value ?? null, probabilities: f.recommended_status?.probabilities ?? {} },
    creditNoteNeeded: {
      value: typeof f.credit_note_needed?.value === "boolean" ? f.credit_note_needed.value : null,
      probability: typeof f.credit_note_needed?.probabilities?.yes === "number" ? f.credit_note_needed.probabilities.yes : null,
    },
    expenseCategory: { value: f.expense_category?.value ?? null, probabilities: f.expense_category?.probabilities ?? {} },
    ownerSummary: typeof f.owner_summary?.value === "string" ? f.owner_summary.value : null,
    emailToSupplier: typeof f.email_to_supplier?.value === "string" ? f.email_to_supplier.value : null,
    emailCheck: null,
  };

  if (record.emailToSupplier) {
    const docs = [
      { id: "invoice", text: p.invoice.text },
      ...(p.delivery?.text ? [{ id: "delivery-note", text: p.delivery.text }] : []),
      ...(p.po?.text ? [{ id: "order", text: p.po.text }] : []),
      { id: "agreed-tariff", text: p.supplier.tariffText },
      { id: "checks", text: brief },
    ];
    const { data: v } = await client.call<any>("grounding", verifyEmailRequest(record.emailToSupplier, docs), "Verify · email before sending");
    record.emailCheck = { verdict: String(v?.verdict ?? ""), grounded: round2(Number(v?.grounded ?? 0)), claims: parseClaims(v) };
  }
  return { record, brief };
}
