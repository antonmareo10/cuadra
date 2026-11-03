import { eur, fmtEs, round2 } from "../money";
import { normalizeCode, normalizeIban, ibanTail } from "./text";
import type { Evidence, Issue, LineMatch, LineRead, ReadDocument, SupplierMaster, Verdict } from "./types";

/**
 * Deterministic checks. Clocked reads the documents (Extract, Rerank); the
 * arithmetic is done here, in code, so every euro on screen can be traced to a
 * formula and to the spans it came from.
 */

const QTY_TOL = 0.0005;
const PRICE_TOL = 0.005;
const TOTAL_TOL = 0.02;

export interface ReturnMatch {
  returnIndex: number;
  invoiceLine: number | null;
}

function ev(doc: ReadDocument, f: { value: string | null; start?: number; end?: number } | undefined, by: string): Evidence[] {
  if (!f?.value) return [];
  return [{ doc: doc.kind, quote: f.value, start: f.start, end: f.end, by }];
}

function lineEv(doc: ReadDocument, line: LineRead, by: string): Evidence {
  const quote = [line.code.value, line.description.value, line.quantity.value, line.unit.value].filter(Boolean).join(" ");
  return { doc: doc.kind, quote, start: line.start, end: line.end, by };
}

function qtyStr(n: number, unit: string | null): string {
  return `${Number.isInteger(n) ? n : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} ${unit ?? ""}`.trim();
}

export function runChecks(p: {
  invoice: ReadDocument;
  delivery?: ReadDocument;
  po?: ReadDocument;
  supplier: SupplierMaster;
  matches: LineMatch[];
  returns: ReturnMatch[];
}): Issue[] {
  const { invoice, delivery, po, supplier, matches } = p;
  const issues: Issue[] = [];
  let n = 0;
  const id = () => `i${++n}`;
  const tariff = new Map(supplier.tariff.products.map((t) => [normalizeCode(t.code), t]));
  const matchedPo = new Set(matches.map((m) => m.poLine).filter((x): x is number => x !== null));

  for (const m of matches) {
    const L = invoice.lines[m.invoiceLine];
    if (!L) continue;
    const name = m.name;
    const qi = L.quantity.number ?? null;
    const pi = L.unitPrice.number ?? null;
    const vi = L.vatRate.number ?? null;
    const ai = L.amount.number ?? null;
    const T = m.tariffCode ? tariff.get(m.tariffCode) : undefined;
    const P = m.poLine !== null ? po?.lines[m.poLine] : undefined;
    const D = m.deliveryLine !== null ? delivery?.lines[m.deliveryLine] : undefined;
    const unit = L.unit.value;
    const vatForMoney = (T?.vat ?? vi ?? 0) / 100;

    // Line arithmetic as printed
    if (qi !== null && pi !== null && ai !== null && Math.abs(round2(qi * pi) - ai) > 0.011) {
      const diff = round2(ai - qi * pi);
      issues.push({
        id: id(),
        type: "line_math",
        cls: diff > 0 ? "money" : "info",
        title: `${name}: line amount does not add up`,
        detail: `${qtyStr(qi, unit)} × ${eur(pi)} = ${eur(round2(qi * pi))}, but the line says ${eur(ai)}.`,
        amount: diff > 0 ? round2(diff * (1 + (vi ?? 0) / 100)) : 0,
        invoiceLine: m.invoiceLine,
        product: name,
        math: `${fmtEs(qi, 3)} × ${fmtEs(pi)} = ${fmtEs(round2(qi * pi))} ≠ ${fmtEs(ai)}`,
        evidence: [...ev(invoice, L.amount, "Extract")],
        sources: ["Extract", "checks"],
        resolution: diff > 0 ? "credit_note" : "accept",
      });
    }

    // Quantity: billed vs delivered (and returned at the door)
    const returned = p.returns
      .filter((r) => r.invoiceLine === m.invoiceLine)
      .reduce((sum, r) => sum + (delivery?.returns[r.returnIndex]?.quantity.number ?? 0), 0);
    const qd = D?.quantity.number ?? null;
    let qPay = qi;
    if (delivery && delivery.lines.length && qi !== null && pi !== null) {
      if (!D) {
        issues.push({
          id: id(),
          type: "billed_not_delivered",
          cls: "money",
          title: `${name}: invoiced but not on the delivery note`,
          detail: `The invoice bills ${qtyStr(qi, unit)} that the signed delivery note does not list.`,
          amount: round2(qi * pi * (1 + vatForMoney)),
          invoiceLine: m.invoiceLine,
          product: name,
          math: `${fmtEs(qi, 3)} × ${fmtEs(pi)} + IVA ${Math.round(vatForMoney * 100)}%`,
          evidence: [lineEv(invoice, L, "Extract")],
          sources: ["Extract", "checks"],
          resolution: "credit_note",
        });
        qPay = 0;
      } else if (qd !== null) {
        const notDelivered = Math.max(0, qi - qd);
        const effective = qd - returned;
        const returnedBilled = Math.max(0, Math.min(returned, qi - effective - notDelivered));
        if (notDelivered > QTY_TOL) {
          const note = D.description.value && /pendiente|falta|sin stock/i.test(D.description.value) ? D.description.value : null;
          issues.push({
            id: id(),
            type: "billed_not_delivered",
            cls: "money",
            title: `${name}: billed ${qtyStr(qi, unit)}, delivered ${qtyStr(qd, unit)}`,
            detail: `The invoice bills ${qtyStr(notDelivered, unit)} more than the signed delivery note shows${note ? ` (“${note}”)` : ""}.`,
            amount: round2(notDelivered * pi * (1 + vatForMoney)),
            invoiceLine: m.invoiceLine,
            product: name,
            math: `(${fmtEs(qi, 3)} − ${fmtEs(qd, 3)}) × ${fmtEs(pi)} + IVA ${Math.round(vatForMoney * 100)}% = ${fmtEs(round2(notDelivered * pi * (1 + vatForMoney)))}`,
            evidence: [...ev(invoice, L.quantity, "Extract"), ...ev(delivery, D.quantity, "Extract"), lineEv(delivery, D, "Extract")],
            sources: ["Extract", delivery && m.deliveryBy === "rerank" ? "Rerank" : "code match", "checks"],
            resolution: "credit_note",
          });
        }
        if (returnedBilled > QTY_TOL) {
          const ret = p.returns.filter((r) => r.invoiceLine === m.invoiceLine).map((r) => delivery.returns[r.returnIndex]);
          issues.push({
            id: id(),
            type: "returned_at_delivery",
            cls: "money",
            title: `${name}: returned at delivery, still invoiced`,
            detail: `The delivery note says ${qtyStr(returnedBilled, unit)} went back with the driver, but the invoice bills the full ${qtyStr(qi, unit)}.`,
            amount: round2(returnedBilled * pi * (1 + vatForMoney)),
            invoiceLine: m.invoiceLine,
            product: name,
            math: `${fmtEs(returnedBilled, 3)} × ${fmtEs(pi)} + IVA ${Math.round(vatForMoney * 100)}% = ${fmtEs(round2(returnedBilled * pi * (1 + vatForMoney)))}`,
            evidence: [
              ...ret.flatMap((r) => [...ev(delivery, r.product, "Extract"), ...ev(delivery, r.quantity, "Extract"), ...ev(delivery, r.reason, "Extract")]),
              ...ev(invoice, L.quantity, "Extract"),
            ],
            sources: ["Extract", "Rerank", "checks"],
            resolution: "credit_note",
          });
        }
        qPay = Math.min(qi, Math.max(0, effective));
      }
    }

    // Price vs agreed (order sheet price, else the tariff on file)
    const poPrice = P?.unitPrice.number ?? null;
    const agreed = poPrice ?? T?.price ?? null;
    if (agreed !== null && pi !== null && qPay !== null && pi - agreed > PRICE_TOL && qPay > 0) {
      const amount = round2((pi - agreed) * qPay * (1 + vatForMoney));
      issues.push({
        id: id(),
        type: "price_above_agreed",
        cls: "money",
        title: `${name}: ${eur(pi)} invoiced, ${eur(agreed)} agreed`,
        detail: `${poPrice !== null ? "The order sheet" : `The agreed tariff (${supplier.tariff.validity.toLowerCase()})`} says ${eur(agreed)} per ${unit ?? "unit"}.`,
        amount,
        invoiceLine: m.invoiceLine,
        product: name,
        math: `(${fmtEs(pi)} − ${fmtEs(agreed)}) × ${fmtEs(qPay, 3)} + IVA ${Math.round(vatForMoney * 100)}% = ${fmtEs(amount)}`,
        evidence: [
          ...ev(invoice, L.unitPrice, "Extract"),
          ...(P ? ev(po!, P.unitPrice, "Extract") : []),
          ...(T && poPrice === null ? [{ doc: "tariff" as const, quote: `${T.code} · ${T.name} · ${fmtEs(T.price)} €`, by: "tariff on file" }] : []),
        ],
        sources: ["Extract", "checks"],
        resolution: "credit_note",
      });
    }

    // VAT rate vs the rate on the agreed tariff
    if (T && vi !== null && Math.abs(vi - T.vat) > 0.01 && qPay !== null && qPay > 0) {
      const base = round2(qPay * Math.min(pi ?? T.price, agreed ?? T.price));
      const amount = round2((base * (vi - T.vat)) / 100);
      issues.push({
        id: id(),
        type: "vat_rate_wrong",
        cls: amount > 0 ? "money" : "info",
        title: `${name}: VAT ${vi}% instead of ${T.vat}%`,
        detail: `This product is on the agreed tariff at ${T.vat}% VAT.`,
        amount: Math.max(0, amount),
        invoiceLine: m.invoiceLine,
        product: name,
        math: `${fmtEs(base)} × (${vi}% − ${T.vat}%) = ${fmtEs(amount)}`,
        evidence: [...ev(invoice, L.vatRate, "Extract"), { doc: "tariff", quote: `${T.code} · ${T.name} · IVA ${T.vat}%`, by: "tariff on file" }],
        sources: ["Extract", "checks"],
        resolution: amount > 0 ? "credit_note" : "accept",
      });
    }

    // Not on the order
    if (po && po.lines.length && m.poLine === null) {
      const lineValue = round2((qPay ?? qi ?? 0) * (pi ?? 0) * (1 + vatForMoney));
      const closest = m.closestDifferent ? po.lines[m.closestDifferent.index] : undefined;
      issues.push({
        id: id(),
        type: "not_ordered",
        cls: "review",
        title: `${name}: delivered and invoiced, not on the order`,
        detail: closest
          ? `Closest order line is “${closest.description.value}”; Rerank judges it a different product (${Math.round(m.closestDifferent!.relevance * 100)}% same product).`
          : "No order line asks for this product.",
        amount: lineValue,
        invoiceLine: m.invoiceLine,
        product: name,
        evidence: [
          lineEv(invoice, L, "Extract"),
          ...(D ? [lineEv(delivery!, D, "Extract")] : []),
          ...(closest ? [lineEv(po, closest, "Rerank")] : []),
        ],
        sources: ["Rerank", "Extract"],
        resolution: "confirm",
      });
    }
  }

  // Ordered lines nobody delivered or invoiced
  if (po) {
    const substitutedFor = new Set(matches.map((m) => m.closestDifferent?.index).filter((x): x is number => x !== undefined));
    for (const P of po.lines) {
      if (matchedPo.has(P.index) || substitutedFor.has(P.index)) continue;
      issues.push({
        id: id(),
        type: "ordered_not_delivered",
        cls: "info",
        title: `${P.description.value}: ordered, not delivered or invoiced`,
        detail: "Nothing to pay. Re-order if it is still needed.",
        amount: 0,
        product: P.description.value ?? undefined,
        evidence: [lineEv(po, P, "Extract")],
        sources: ["Rerank", "Extract"],
        resolution: "accept",
      });
    }
  }

  // Invoice totals as printed
  const rates = new Map<number, number>();
  for (const L of invoice.lines) {
    const r = L.vatRate.number ?? 0;
    rates.set(r, round2((rates.get(r) ?? 0) + (L.amount.number ?? 0)));
  }
  const computed = round2([...rates.entries()].reduce((a, [r, base]) => a + base + round2((base * r) / 100), 0));
  const printed = invoice.header.total?.number ?? null;
  if (printed !== null && invoice.lines.length && Math.abs(printed - computed) > TOTAL_TOL) {
    const diff = round2(printed - computed);
    issues.push({
      id: id(),
      type: "totals_math",
      cls: diff > 0 ? "money" : "info",
      title: `Invoice total ${eur(printed)}, lines add up to ${eur(computed)}`,
      detail: `The printed total is ${eur(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than its own lines plus VAT.`,
      amount: Math.max(0, diff),
      math: [...rates.entries()].map(([r, b]) => `${fmtEs(b)} + IVA ${r}% ${fmtEs(round2((b * r) / 100))}`).join(" + ") + ` = ${fmtEs(computed)}`,
      evidence: [...ev(invoice, invoice.header.total, "Extract"), ...ev(invoice, invoice.header.subtotal, "Extract")],
      sources: ["Extract", "checks"],
      resolution: diff > 0 ? "credit_note" : "accept",
    });
  }

  // Bank details vs the IBAN on file (Protect findings + Extract)
  const ibans = [
    ...invoice.pii.filter((x) => x.type === "bank_account").map((x) => ({ value: x.value, start: x.start, end: x.end, by: "Protect" })),
    ...(invoice.header.iban?.value ? [{ value: invoice.header.iban.value, start: invoice.header.iban.start, end: invoice.header.iban.end, by: "Extract" }] : []),
  ].filter((x) => normalizeIban(x.value).length >= 15);
  if (ibans.length && !ibans.some((x) => normalizeIban(x.value) === normalizeIban(supplier.ibanOnFile))) {
    issues.push({
      id: id(),
      type: "bank_details_changed",
      cls: "stop",
      title: "The invoice asks to pay a different bank account",
      detail: `Invoice IBAN ${ibanTail(ibans[0].value)} is not the IBAN on file for ${supplier.name} (${ibanTail(supplier.ibanOnFile)}). Confirm by phone on ${supplier.phoneOnFile}, the number on file, not one printed on this invoice.`,
      amount: 0,
      evidence: ibans.map((x) => ({ doc: "invoice" as const, quote: x.value, start: x.start, end: x.end, by: x.by })),
      sources: ["Protect", "Extract"],
      resolution: "hold",
    });
  }

  // Safety signals from intake
  for (const d of [invoice, delivery, po].filter((x): x is ReadDocument => Boolean(x))) {
    if (d.guard?.flagged) {
      issues.push({
        id: id(),
        type: "injection",
        cls: "stop",
        title: `${d.label}: hidden instructions for AI assistants`,
        detail: `Guard: ${d.guard.category} (${Math.round(d.guard.injection * 100)}%, severity ${d.guard.severity}). The passage was removed before the document was read, and nothing in it can approve this invoice.`,
        amount: 0,
        evidence: d.guard.evidence.map((e) => ({ doc: d.kind, quote: e.quote, start: e.start, end: e.end, by: "Guard" })),
        sources: ["Guard"],
        resolution: "hold",
      });
    }
    if (d.scripts.length && (d.inspect === null || d.inspect.flagged)) {
      issues.push({
        id: id(),
        type: "active_content",
        cls: "stop",
        title: `${d.label}: the PDF contains a script`,
        detail: d.inspect
          ? `Inspect: ${d.inspect.verdict}, ${d.inspect.category} (${Math.round(d.inspect.malicious * 100)}% malicious, severity ${d.inspect.severity}). Do not open this file in a PDF reader with scripts enabled.`
          : "A script was found and could not be checked, so the file is treated as unsafe.",
        amount: 0,
        evidence: (d.inspect?.evidence ?? []).map((e) => ({ doc: d.kind, quote: e.line, by: "Inspect" })),
        sources: ["Inspect"],
        resolution: "hold",
      });
    }
  }

  if (!invoice.readable) {
    issues.push({
      id: id(),
      type: "unreadable",
      cls: "stop",
      title: "The invoice could not be read",
      detail: `${invoice.problems.join(" ")} Nothing is approved without a readable invoice.`,
      amount: 0,
      evidence: [],
      sources: ["Extract"],
      resolution: "hold",
    });
  }
  return issues;
}

/** What the restaurant should pay, given the issues and how each one is resolved. */
export function computeVerdict(invoice: ReadDocument, issues: Issue[], expectedPayable: number | null): Verdict {
  const total = invoice.header.total?.number ?? null;
  const stops = issues.filter((i) => i.cls === "stop" && i.resolution === "hold");
  const withheld = (r: string) => round2(issues.filter((i) => i.resolution === r).reduce((a, i) => a + i.amount, 0));
  const disputed = withheld("credit_note");
  const pending = withheld("confirm");
  if (!invoice.readable || total === null) {
    return { kind: "unreadable", headline: "Could not read the invoice", invoiceTotal: total, payNow: 0, disputed, pending, expectedPayable };
  }
  if (stops.length) {
    return {
      kind: "hold",
      headline: "Hold payment",
      invoiceTotal: total,
      payNow: 0,
      disputed,
      pending,
      expectedPayable,
    };
  }
  const payNow = round2(total - disputed - pending - withheld("hold"));
  if (disputed + pending <= 0.0001) {
    return { kind: "ready", headline: "Ready to pay", invoiceTotal: total, payNow, disputed, pending, expectedPayable };
  }
  return { kind: "pay_adjusted", headline: "Pay the undisputed amount", invoiceTotal: total, payNow, disputed, pending, expectedPayable };
}

/** Independent recomputation: what the delivered goods cost at agreed prices and VAT. */
export function expectedPayable(p: {
  invoice: ReadDocument;
  delivery?: ReadDocument;
  po?: ReadDocument;
  supplier: SupplierMaster;
  matches: LineMatch[];
  returns: ReturnMatch[];
}): number | null {
  const tariff = new Map(p.supplier.tariff.products.map((t) => [normalizeCode(t.code), t]));
  const byRate = new Map<number, number>();
  for (const m of p.matches) {
    const L = p.invoice.lines[m.invoiceLine];
    const T = m.tariffCode ? tariff.get(m.tariffCode) : undefined;
    const qi = L?.quantity.number;
    const pi = L?.unitPrice.number;
    if (qi == null || pi == null) return null;
    const D = m.deliveryLine !== null ? p.delivery?.lines[m.deliveryLine] : undefined;
    const returned = p.returns
      .filter((r) => r.invoiceLine === m.invoiceLine)
      .reduce((s, r) => s + (p.delivery?.returns[r.returnIndex]?.quantity.number ?? 0), 0);
    const delivered = p.delivery && p.delivery.lines.length ? (D?.quantity.number ?? 0) - returned : qi;
    const q = Math.max(0, Math.min(qi, delivered));
    const P = m.poLine !== null ? p.po?.lines[m.poLine] : undefined;
    const agreed = P?.unitPrice.number ?? T?.price ?? pi;
    const price = Math.min(pi, agreed);
    const rate = T?.vat ?? L.vatRate.number ?? 0;
    byRate.set(rate, round2((byRate.get(rate) ?? 0) + round2(q * price)));
  }
  return round2([...byRate.entries()].reduce((a, [r, b]) => a + b + round2((b * r) / 100), 0));
}
