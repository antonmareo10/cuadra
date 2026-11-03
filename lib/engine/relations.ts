import type { ClockedClient } from "../clocked/client";
import { fmtEs } from "../money";
import { compareRequest } from "./requests";
import { normalizeCode } from "./text";
import type { DocKind, DocRelation, Evidence, HistoryInvoice, Issue, ReadDocument } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DOC_IDS: Record<DocKind, string> = { po: "order", delivery: "delivery-note", invoice: "invoice" };

function evFrom(p: any, idToKind: Map<string, Evidence["doc"]>, by: string): Evidence {
  return {
    doc: idToKind.get(p?.document) ?? "history",
    quote: String(p?.quote ?? ""),
    start: Number.isInteger(p?.start) ? p.start : undefined,
    end: Number.isInteger(p?.end) ? p.end : undefined,
    by,
  };
}

/**
 * Compare reads every pair among the order, delivery note, invoice and the
 * supplier's earlier invoices in one request. Two outputs change the result:
 *  - invoice ↔ earlier invoice judged "same" → duplicate invoice (hard stop),
 *    cross-checked in code against the delivery note number and the total;
 *  - conflicts between this purchase's documents become evidence on the matching
 *    issue, or a new "documents disagree" issue when no check explains them.
 */
export async function compareDocuments(
  client: ClockedClient,
  docs: { invoice: ReadDocument; delivery?: ReadDocument; po?: ReadDocument },
  history: HistoryInvoice[],
  issues: Issue[],
  nextId: () => string,
): Promise<DocRelation[]> {
  const list: { id: string; text: string }[] = [];
  const idToKind = new Map<string, Evidence["doc"]>();
  for (const d of [docs.po, docs.delivery, docs.invoice]) {
    if (!d || !d.text.trim()) continue;
    list.push({ id: DOC_IDS[d.kind], text: d.text });
    idToKind.set(DOC_IDS[d.kind], d.kind);
  }
  for (const h of history.slice(0, 4)) {
    const hid = `earlier-${h.number}`;
    list.push({ id: hid, text: h.text });
    idToKind.set(hid, "history");
  }
  if (list.length < 2) return [];

  const { data } = await client.call<any>("compare", compareRequest(list), `Compare · ${list.length} documents`);
  const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
  const relations: DocRelation[] = pairs.map((p) => ({
    a: p.a,
    b: p.b,
    relation: p.relation,
    probabilities: p.probabilities ?? {},
    duplicates: Array.isArray(p.duplicates) ? p.duplicates.length : 0,
    conflicts: (Array.isArray(p.conflicts) ? p.conflicts : []).map((c: any) => ({
      kind: String(c.kind ?? "conflict"),
      confidence: Number(c.confidence ?? 0),
      a: evFrom(c.a, idToKind, "Compare"),
      b: evFrom(c.b, idToKind, "Compare"),
    })),
  }));

  // Duplicates: this invoice vs earlier invoices
  const inv = docs.invoice;
  const dnRef = normalizeCode(inv.header.delivery_reference?.value);
  for (const r of relations) {
    const other = r.a === "invoice" ? r.b : r.b === "invoice" ? r.a : null;
    if (!other || !other.startsWith("earlier-")) continue;
    const h = history.find((x) => `earlier-${x.number}` === other);
    if (!h) continue;
    const sameDn = Boolean(dnRef) && normalizeCode(h.text).includes(dnRef);
    const total = inv.header.total?.number;
    const sameTotal = total != null && h.text.includes(`TOTAL FACTURA: ${fmtEs(total)}`);
    if (r.relation === "same" || (sameDn && (r.probabilities.same ?? 0) > 0.2)) {
      const pSame = r.probabilities.same ?? 0;
      issues.push({
        id: nextId(),
        type: "duplicate_invoice",
        cls: "stop",
        title: `Possible duplicate of ${h.number} (${h.status.toLowerCase()})`,
        detail:
          `Compare judges this invoice the same as ${h.number} (${Math.round(pSame * 100)}% same).` +
          (sameDn ? ` Both bill delivery note ${inv.header.delivery_reference?.value}.` : "") +
          (sameTotal ? " The totals are identical." : "") +
          " Paying it would pay the same delivery twice.",
        amount: 0,
        evidence: [
          ...(inv.header.number?.value ? [{ doc: "invoice" as const, quote: inv.header.number.value, start: inv.header.number.start, end: inv.header.number.end, by: "Extract" }] : []),
          { doc: "history", quote: h.text.split("\n")[0], by: "Compare" },
          ...(sameDn ? [{ doc: "history" as const, quote: `Albarán: ${inv.header.delivery_reference?.value}`, by: "check" }] : []),
        ],
        sources: ["Compare", ...(sameDn ? ["checks"] : [])],
        resolution: "hold",
      });
    }
  }

  // Conflicts inside this purchase → evidence on line issues, or a review issue
  const purchaseIds = new Set(Object.values(DOC_IDS));
  for (const r of relations) {
    if (!purchaseIds.has(r.a) || !purchaseIds.has(r.b)) continue;
    for (const c of r.conflicts) {
      const invSide = c.a.doc === "invoice" ? c.a : c.b.doc === "invoice" ? c.b : null;
      const line =
        invSide && invSide.start !== undefined
          ? inv.lines.find((l) => l.start !== undefined && l.end !== undefined && invSide.start! < l.end && invSide.end! > l.start)
          : undefined;
      const target = line ? issues.find((i) => i.invoiceLine === line.index && i.cls !== "info") : undefined;
      if (target) {
        target.evidence.push(c.a, c.b);
        if (!target.sources.includes("Compare")) target.sources.push("Compare");
      } else if (c.confidence >= 0.6 && (r.a === "invoice" || r.b === "invoice")) {
        // Only conflicts that touch the invoice can change what is paid.
        const explained = issues.some((i) =>
          [c.a, c.b].some((e) => i.evidence.some((x) => x.doc === e.doc && x.start !== undefined && e.start !== undefined && x.start < (e.end ?? 0) && (x.end ?? 0) > e.start)),
        );
        if (explained) continue;
        issues.push({
          id: nextId(),
          type: "documents_disagree",
          cls: "review",
          title: "The documents disagree",
          detail: `Compare found a ${c.kind} conflict between the ${labelOf(c.a.doc)} and the ${labelOf(c.b.doc)} that no arithmetic check explains.`,
          amount: 0,
          invoiceLine: line?.index,
          evidence: [c.a, c.b],
          sources: ["Compare"],
          resolution: "confirm",
        });
      }
    }
  }
  return relations;
}

function labelOf(d: Evidence["doc"]): string {
  return d === "po" ? "order" : d === "delivery" ? "delivery note" : d === "invoice" ? "invoice" : d;
}
