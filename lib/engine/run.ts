import type { CallRecord, ClockedClient, Endpoint } from "../clocked/client";
import { ClockedError } from "../clocked/errors";
import { computeVerdict, expectedPayable, runChecks, type ReturnMatch } from "./checks";
import { readDocument } from "./intake";
import { judgeIssues, rankIssues } from "./judge";
import { matchLines, matchReturns } from "./match";
import { checkSupplierClaims, fillRecord } from "./record";
import { compareDocuments } from "./relations";
import { ibanTail } from "./text";
import type { CaseInput, DocRelation, FilledRecord, Issue, LineMatch, ReadDocument, RunResult, RunStep, SupplierClaimCheck } from "./types";

export const ENGINE_VERSION = "1";
export const OWNER = "Lucía Herrero";

export type RunEvent =
  | { type: "step"; step: RunStep }
  | { type: "call"; call: CallRecord }
  | { type: "result"; result: RunResult }
  | { type: "error"; message: string };

const STEP_META: Record<RunStep["id"], { title: string; endpoints: Endpoint[] }> = {
  intake: { title: "Read and screen the documents", endpoints: ["pii", "script", "pipeline", "injection", "extract"] },
  match: { title: "Match lines across documents", endpoints: ["rerank"] },
  checks: { title: "Check quantities, prices, VAT and totals", endpoints: [] },
  relations: { title: "Compare documents and earlier invoices", endpoints: ["compare", "grounding"] },
  judge: { title: "Triage each discrepancy", endpoints: ["decide"] },
  record: { title: "Fill the record and verify the email", endpoints: ["fill", "grounding"] },
};

function errText(err: unknown): string {
  return err instanceof ClockedError ? err.userMessage : err instanceof Error ? err.message : String(err);
}

/**
 * The full reconciliation of one purchase. Every Clocked call goes through `client`,
 * so the same code runs live, against a recorded run, or against test doubles.
 */
export async function reconcile(
  client: ClockedClient,
  input: CaseInput,
  opts: { calls: CallRecord[]; source: RunResult["source"]; onEvent?: (e: RunEvent) => void },
): Promise<RunResult> {
  const steps: RunStep[] = [];
  const errors: string[] = [];
  const emit = opts.onEvent ?? (() => {});
  const step = (id: RunStep["id"], status: RunStep["status"], note: string) => {
    const s: RunStep = { id, ...STEP_META[id], status, note };
    steps.push(s);
    emit({ type: "step", step: s });
  };

  // 1. Intake: all documents in parallel (the client queues to the account's concurrency).
  const docs: ReadDocument[] = await Promise.all(input.documents.map((d) => readDocument(client, d)));
  const invoice = docs.find((d) => d.kind === "invoice");
  const delivery = docs.find((d) => d.kind === "delivery");
  const po = docs.find((d) => d.kind === "po");
  for (const d of docs) for (const p of d.problems) errors.push(`${d.label}: ${p}`);
  step(
    "intake",
    invoice?.readable ? "done" : "failed",
    docs.map((d) => `${d.label}: ${d.lines.length} lines${d.guard?.flagged ? ", flagged by Guard" : ""}${d.inspect?.flagged ? ", script flagged by Inspect" : ""}`).join(" · "),
  );
  if (!invoice) throw new Error("An invoice is required.");

  // 2. Matching
  let matches: LineMatch[] = [];
  let returns: ReturnMatch[] = [];
  try {
    if (invoice.lines.length) {
      matches = await matchLines(client, invoice, delivery, po, input.supplier, input.restaurant);
      returns = await matchReturns(client, invoice, delivery, input.supplier, input.restaurant);
    }
    step("match", invoice.lines.length ? "done" : "skipped", `${matches.filter((m) => m.poLine !== null).length}/${matches.length} invoice lines matched to the order, ${matches.filter((m) => m.deliveryLine !== null).length} to the delivery note`);
  } catch (err) {
    errors.push(`Matching: ${errText(err)}`);
    step("match", "failed", errText(err));
  }

  // 3. Deterministic checks
  const issues: Issue[] = runChecks({ invoice, delivery, po, supplier: input.supplier, matches, returns });
  let counter = issues.length;
  const nextId = () => `i${++counter}`;
  step("checks", "done", `${issues.length} findings`);

  // 4. Relations (Compare) + the supplier's own claims (Verify)
  let relations: DocRelation[] = [];
  let supplierClaim: SupplierClaimCheck | null = null;
  try {
    if (invoice.readable) {
      relations = await compareDocuments(client, { invoice, delivery, po }, input.history, issues, nextId);
      supplierClaim = await checkSupplierClaims(client, invoice, po, input.supplier, issues);
    }
    step("relations", invoice.readable ? "done" : "skipped", `${relations.length} document pairs compared`);
  } catch (err) {
    errors.push(`Compare/Verify: ${errText(err)}`);
    step("relations", "failed", errText(err));
  }

  // 5. Decide
  try {
    const n = await judgeIssues(client, issues);
    step("judge", n ? "done" : "skipped", n ? `${n} discrepancies triaged` : "Nothing needs a judgement call");
  } catch (err) {
    errors.push(`Decide: ${errText(err)}. Discrepancies keep their default action.`);
    step("judge", "failed", errText(err));
  }

  const ranked = rankIssues(issues);
  const expected = invoice.readable ? expectedPayable({ invoice, delivery, po, supplier: input.supplier, matches, returns }) : null;
  const verdict = computeVerdict(invoice, ranked, expected);

  // 6. Fill + Verify
  let record: FilledRecord | null = null;
  try {
    if (invoice.readable) {
      ({ record } = await fillRecord(client, {
        restaurant: input.restaurant,
        owner: OWNER,
        supplier: input.supplier,
        invoice,
        delivery,
        po,
        issues: ranked,
        verdict,
        claim: supplierClaim,
      }));
    }
    step(
      "record",
      record ? "done" : "skipped",
      !record ? "Skipped: nothing readable to record" : record.emailCheck ? `Email checked: ${record.emailCheck.verdict.replace(/_/g, " ")}` : "Record filled, nothing to email",
    );
  } catch (err) {
    errors.push(`Fill/Verify: ${errText(err)}`);
    step("record", "failed", errText(err));
  }

  const calls = opts.calls;
  const result: RunResult = {
    caseId: input.id,
    title: input.title,
    story: input.story,
    supplier: {
      name: input.supplier.name,
      taxId: input.supplier.taxId,
      phoneOnFile: input.supplier.phoneOnFile,
      ibanOnFileTail: ibanTail(input.supplier.ibanOnFile),
      paymentTerms: input.supplier.paymentTerms,
      tariff: input.supplier.tariff,
    },
    source: opts.source,
    documents: docs,
    matches,
    issues: ranked,
    relations,
    record,
    supplierClaim,
    verdict,
    steps,
    calls,
    totals: {
      credits: calls.reduce((a, c) => a + (c.credits ?? 0), 0),
      modelMs: Math.round(calls.reduce((a, c) => a + (c.modelMs ?? 0), 0)),
      wallMs: calls.reduce((a, c) => a + c.wallMs, 0),
      calls: calls.length,
    },
    errors,
  };
  emit({ type: "result", result });
  return result;
}
