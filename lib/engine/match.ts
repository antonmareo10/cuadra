import type { ClockedClient } from "../clocked/client";
import { MATCH_INSTRUCTIONS, matchRequest } from "./requests";
import { normalizeCode } from "./text";
import type { LineCandidate, LineMatch, ReadDocument, RerankLevels, SupplierMaster } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const USE_THRESHOLD = 0.5;

function parseCandidates(data: any): LineCandidate[] {
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return results.map((r) => ({
    index: Number(String(r.id ?? "").split("-").pop()),
    action: r.action,
    reason: r.reason,
    relevance: Number(r.relevance_score ?? 0),
    levels: (r.levels ?? {}) as RerankLevels,
  }));
}

/**
 * Line matching across the three documents.
 *  - Delivery note ↔ invoice: same supplier, same product codes → exact code match (no API call).
 *    Lines without a code fall back to Rerank against the delivery lines.
 *  - Order ↔ invoice: the order is written by the restaurant (often a WhatsApp message) and has
 *    no supplier codes, so every invoice line asks Rerank which order line is the same product.
 *  - Agreed price and VAT come from the supplier master data by code.
 */
export async function matchLines(
  client: ClockedClient,
  invoice: ReadDocument,
  delivery: ReadDocument | undefined,
  po: ReadDocument | undefined,
  supplier: SupplierMaster,
  restaurant: string,
): Promise<LineMatch[]> {
  const dnByCode = new Map<string, number>();
  delivery?.lines.forEach((l) => {
    const c = normalizeCode(l.code.value);
    if (c && !dnByCode.has(c)) dnByCode.set(c, l.index);
  });
  const tariffByCode = new Map(supplier.tariff.products.map((p) => [normalizeCode(p.code), p]));
  const poDocs = (po?.lines ?? []).map((l) => ({
    id: `po-${l.index}`,
    text: [l.description.value, l.quantity.value, l.unit.value].filter(Boolean).join(" · "),
  }));

  const matches: LineMatch[] = await Promise.all(
    invoice.lines.map(async (line): Promise<LineMatch> => {
      const code = normalizeCode(line.code.value);
      const dnByCodeLine = code && dnByCode.has(code) ? delivery?.lines[dnByCode.get(code)!] : undefined;
      // The product name to match on: as invoiced, else as delivered, else the name on the tariff for that code.
      const name = line.description.value ?? dnByCodeLine?.description.value ?? tariffByCode.get(code)?.name ?? line.code.value ?? null;
      const m: LineMatch = {
        invoiceLine: line.index,
        name: name ?? `line ${line.index + 1}`,
        deliveryLine: null,
        deliveryBy: null,
        poLine: null,
        poCandidates: [],
        tariffCode: code && tariffByCode.has(code) ? code : null,
        closestDifferent: null,
      };
      if (code && dnByCode.has(code)) {
        m.deliveryLine = dnByCode.get(code)!;
        m.deliveryBy = "code";
      } else if (delivery && delivery.lines.length && name) {
        const docs = delivery.lines.map((l) => ({ id: `po-${l.index}`, text: [l.code.value, l.description.value].filter(Boolean).join(" ") }));
        const { data } = await client.call<any>(
          "rerank",
          matchRequest(name, docs, supplier.name, restaurant),
          `Rerank · delivery line for ${name}`,
        );
        const best = parseCandidates(data).find((c) => c.action === "use" && c.relevance >= USE_THRESHOLD);
        if (best) {
          m.deliveryLine = best.index;
          m.deliveryBy = "rerank";
        }
      }
      if (poDocs.length && name) {
        const { data } = await client.call<any>(
          "rerank",
          matchRequest(name, poDocs, supplier.name, restaurant),
          `Rerank · order line for ${name}`,
        );
        m.poCandidates = parseCandidates(data);
      }
      return m;
    }),
  );

  // Assign order lines greedily by relevance so two invoice lines cannot claim the same order line.
  const pairs = matches
    .flatMap((m) => m.poCandidates.filter((c) => c.action === "use" && c.relevance >= USE_THRESHOLD).map((c) => ({ m, c })))
    .sort((x, y) => y.c.relevance - x.c.relevance);
  const takenPo = new Set<number>();
  const assigned = new Set<number>();
  for (const { m, c } of pairs) {
    if (takenPo.has(c.index) || assigned.has(m.invoiceLine)) continue;
    m.poLine = c.index;
    takenPo.add(c.index);
    assigned.add(m.invoiceLine);
  }
  // For an unmatched invoice line, the closest order line nobody else matched: shown as
  // "closest order line" and linked as a possible substitution (Decide reads the evidence).
  const near = (c: LineCandidate) => c.relevance + (c.levels.different_case ?? 0) + (c.levels.elsewhere ?? 0);
  for (const m of matches) {
    if (m.poLine === null && m.poCandidates.length) {
      const top = m.poCandidates.filter((c) => !takenPo.has(c.index)).sort((a, b) => near(b) - near(a))[0];
      if (top && near(top) >= 0.1) {
        m.closestDifferent = top;
        takenPo.add(top.index);
      }
    }
  }
  return matches;
}

/** Goods the delivery note says went back with the driver → which invoice line they belong to (Rerank). */
export async function matchReturns(
  client: ClockedClient,
  invoice: ReadDocument,
  delivery: ReadDocument | undefined,
  supplier: SupplierMaster,
  restaurant: string,
): Promise<{ returnIndex: number; invoiceLine: number | null }[]> {
  if (!delivery?.returns.length || !invoice.lines.length) return [];
  const docs = invoice.lines.map((l) => ({ id: `inv-${l.index}`, text: [l.code.value, l.description.value].filter(Boolean).join(" ") }));
  return Promise.all(
    delivery.returns.map(async (r, returnIndex) => {
      const { data } = await client.call<any>(
        "rerank",
        {
          query: `Returned at delivery: "${r.product.value}". Which invoice line bills this product?`,
          documents: docs,
          context: { supplier: supplier.name, customer: restaurant },
          instructions: MATCH_INSTRUCTIONS,
        },
        `Rerank · invoice line for returned ${r.product.value}`,
      );
      const best = parseCandidates(data).find((c) => c.action === "use" && c.relevance >= USE_THRESHOLD);
      return { returnIndex, invoiceLine: best ? best.index : null };
    }),
  );
}
