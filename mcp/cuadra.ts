import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ClockedError } from "../lib/clocked/errors";
import { listCaseIds, loadManifest } from "../lib/cases";
import type { RunResult } from "../lib/engine/types";
import { eur } from "../lib/money";
import { claimText, explainFinding, explainText, summarizeRun, summaryText, supplierClaim } from "./format";
import { chooseMode, liveBudget, runFiles, runSample, type Mode } from "./runtime";

/**
 * Cuadra as an MCP server: an assistant can check a restaurant's supplier invoice
 * against the order and the delivery note, explain each finding down to the printed
 * line, and get the supplier email Clocked Fill wrote and Verify checked.
 *
 * Every check runs the same reconcile() as the web app. In replay mode the Clocked
 * answers come from the real recordings; in live mode from the API, behind the hard
 * credit cap. Explanations and drafts reuse the run: they never call Clocked again.
 */

export const SERVER_VERSION = "2.0.0";

const source = z.object({
  where: z.string().describe('Human form, e.g. "Invoice, line 13"'),
  document: z.string(),
  line: z.number().nullable().describe("1-based line in the document text, null when the source has no character position"),
  last_line: z.number().optional(),
  line_text: z.string().optional().describe("The whole printed line"),
  quote: z.string().describe("The exact value or passage"),
  by: z.string().describe("Clocked endpoint or check that produced it"),
  note: z.string().optional(),
});

const checkOutput = {
  run_id: z.string(),
  case_id: z.string(),
  source: z.string().describe("Recorded run replayed, or live run"),
  supplier: z.string(),
  invoice: z.object({ number: z.string().nullable(), date: z.string().nullable(), total_printed_eur: z.number().nullable() }),
  decision: z.object({
    kind: z.enum(["ready", "pay_adjusted", "hold", "unreadable"]),
    text: z.string(),
    pay_now_eur: z.number(),
    claim_eur: z.number(),
    check_first_eur: z.number(),
    waiting_for_photo_check_eur: z.number().describe("Part of check_first_eur held only until the owner has looked at a delivery note read from a photo"),
    independent_recomputation_eur: z.number().nullable(),
  }),
  findings: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      severity: z.enum(["money", "review", "stop", "info"]),
      title: z.string(),
      amount_eur: z.number(),
      action: z.string(),
      decided_by: z.string(),
      sources: z.array(source),
    }),
  ),
  safety: z.object({
    guard: z.array(z.object({ document: z.string(), flagged: z.boolean(), category: z.string(), severity: z.string(), passage_removed_before_reading: z.boolean() })),
    inspect: z.array(z.object({ document: z.string(), flagged: z.boolean(), verdict: z.string(), category: z.string() })),
    bank_account: z.string(),
  }),
  clocked: z.object({ calls: z.number(), credits: z.number(), model_ms: z.number(), endpoints: z.array(z.string()) }),
  errors: z.array(z.string()),
  matched_sample_case: z.string().optional().describe("Set when the files given were recognised as a recorded sample case"),
};

const runRef = {
  run_id: z.string().optional().describe("The run_id returned by check_documents"),
  case_id: z.string().optional().describe("Or a sample case id: its recorded run is used"),
};

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function errorMessage(err: unknown): string {
  if (err instanceof ClockedError) return `${err.userMessage} (${err.message})`;
  return err instanceof Error ? err.message : String(err);
}

export interface CuadraOptions {
  mode?: Mode;
  env?: Record<string, string | undefined>;
  log?: (msg: string) => void;
}

export function createCuadraServer(opts: CuadraOptions = {}): McpServer {
  const env = opts.env ?? process.env;
  const mode = opts.mode ?? chooseMode(env);
  const log = opts.log ?? ((m: string) => process.stderr.write(`[cuadra] ${m}\n`));
  const runs = new Map<string, RunResult>();
  const latestByCase = new Map<string, string>();
  let seq = 0;

  const keep = (run: RunResult): string => {
    const id = `${run.caseId}-${++seq}`;
    runs.set(id, run);
    latestByCase.set(run.caseId, id);
    if (runs.size > 50) runs.delete(runs.keys().next().value as string);
    return id;
  };

  /** A run the assistant refers to: by run_id, or the latest (or replayed) run of a sample case. */
  async function resolveRun(ref: { run_id?: string; case_id?: string }): Promise<{ run: RunResult; runId: string }> {
    if (ref.run_id) {
      const run = runs.get(ref.run_id);
      if (!run) throw new Error(`No run "${ref.run_id}" in this session. Call check_documents first.`);
      return { run, runId: ref.run_id };
    }
    if (ref.case_id) {
      const known = latestByCase.get(ref.case_id);
      if (known && runs.has(known)) return { run: runs.get(known)!, runId: known };
      const run = await runSample(ref.case_id);
      return { run, runId: keep(run) };
    }
    throw new Error("Give a run_id from check_documents, or a sample case_id.");
  }

  const server = new McpServer(
    { name: "cuadra", version: SERVER_VERSION },
    {
      instructions:
        "Cuadra checks a restaurant's supplier invoice against the chef's order and the signed delivery note, and says what to pay, what to claim back and what to hold. " +
        "Start with check_documents (a sample case_id, or local file paths). Quote findings with their document and line, e.g. \"Invoice, line 13\". " +
        "Never tell the user an invoice on hold is safe to pay: only the restaurant owner can clear a hold, after calling the supplier on the number on file. " +
        (mode === "replay"
          ? "This server is in replay mode: it answers the five recorded sample cases from real Clocked recordings and makes no network calls."
          : "This server is in live mode: checking new documents calls the Clocked API and spends credits, up to a hard cap."),
    },
  );

  server.registerTool(
    "list_sample_cases",
    {
      title: "List the sample cases",
      description:
        "Lists the five synthetic sample purchases (order, delivery note, invoice) with planted problems, and the verdict of their recorded run. Use a case_id with check_documents.",
      inputSchema: {},
      outputSchema: {
        cases: z.array(
          z.object({
            case_id: z.string(),
            title: z.string(),
            story: z.string(),
            supplier: z.string(),
            documents: z.array(z.object({ kind: z.string(), label: z.string(), path: z.string() })),
            recorded_verdict: z.string().nullable(),
          }),
        ),
        mode: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const index = readIndex();
        const cases = listCaseIds().map((id) => {
          const m = loadManifest(id);
          const v = index.find((i) => i.caseId === id)?.verdict;
          return {
            case_id: id,
            title: m.title,
            story: m.story,
            supplier: index.find((i) => i.caseId === id)?.supplier ?? m.supplier,
            documents: m.documents.map((d) => ({ kind: d.kind, label: d.label, path: `data/cases/${id}/${d.file}` })),
            recorded_verdict: v ? verdictLine(v) : null,
          };
        });
        const text = [
          `Sample cases (synthetic documents, ${mode === "replay" ? "replayed from real Clocked recordings" : "recorded runs available"}):`,
          ...cases.map((c) => `- ${c.case_id}: ${c.title}. ${c.supplier}. Recorded verdict: ${c.recorded_verdict ?? "not recorded"}.`),
        ].join("\n");
        return { content: [{ type: "text", text }], structuredContent: { cases, mode } };
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  server.registerTool(
    "check_documents",
    {
      title: "Check a supplier invoice",
      description:
        "Checks a supplier invoice against the restaurant's order and the delivery note the kitchen signed, using the Clocked API (Protect, Guard, Inspect, Extract, Rerank, Compare, Verify, Decide, Fill). " +
        "Returns one decision (pay now / claim back / check first / hold), each finding with its amount, the action, who decided it, and the exact document line it comes from, plus the safety checks (hidden instructions, scripts, a changed bank account). " +
        "Give either case_id (a recorded sample case, no credits) or local file paths: invoice (required), delivery_note and order (PDF with a text layer, .txt such as a WhatsApp export). " +
        "supplier_id picks the supplier record on file (agreed tariff, IBAN, phone): huerta, gredos, ribera or bahia. " +
        (mode === "replay" ? "This server is in replay mode: files are only accepted when they are a recorded sample case." : "Files are checked live and spend Clocked credits (hard cap)."),
      inputSchema: {
        case_id: z.string().optional().describe("A sample case id from list_sample_cases"),
        invoice: z.string().optional().describe("Path to the supplier invoice (PDF or .txt), absolute or relative to the Cuadra folder"),
        delivery_note: z.string().optional().describe("Path to the signed delivery note"),
        order: z.string().optional().describe("Path to the order: a PDF, or a .txt WhatsApp export"),
        supplier_id: z.string().optional().describe("Supplier record on file: huerta, gredos, ribera or bahia"),
      },
      outputSchema: checkOutput,
      annotations: { readOnlyHint: true, openWorldHint: mode === "live" },
    },
    async (args) => {
      try {
        let run: RunResult;
        let matched: string | null = null;
        if (args.case_id) {
          if (args.invoice || args.delivery_note || args.order) return fail("Give either case_id or file paths, not both.");
          run = await runSample(args.case_id);
        } else if (args.invoice) {
          const r = await runFiles({ invoice: args.invoice, delivery_note: args.delivery_note, order: args.order, supplier_id: args.supplier_id }, mode, env);
          run = r.result;
          matched = r.sampleCase;
        } else {
          return fail("Give a sample case_id, or at least the path of the invoice to check.");
        }
        const runId = keep(run);
        log(`check_documents ${run.caseId} → ${run.verdict.kind} (${run.source.kind})`);
        const summary = { ...summarizeRun(run, runId), ...(matched ? { matched_sample_case: matched } : {}) };
        const note = matched ? `These files are the sample case "${matched}", so its supplier record and earlier invoices were used.\n` : "";
        return { content: [{ type: "text", text: note + summaryText(summary) }], structuredContent: summary };
      } catch (err) {
        log(`check_documents failed: ${errorMessage(err)}`);
        return fail(errorMessage(err));
      }
    },
  );

  server.registerTool(
    "explain_finding",
    {
      title: "Explain one finding",
      description:
        "Explains one finding of a check: the formula, every piece of evidence with its document, line number and the whole printed line, which Clocked endpoint or check found it, Decide's probabilities, and what the owner should do. " +
        "It reads the run check_documents already made and does not call Clocked again.",
      inputSchema: { ...runRef, finding_id: z.string().describe('A finding id from check_documents, e.g. "i1"') },
      outputSchema: {
        run_id: z.string(),
        id: z.string(),
        type: z.string(),
        severity: z.string(),
        title: z.string(),
        detail: z.string(),
        formula: z.string().nullable(),
        amount_eur: z.number(),
        action: z.string(),
        decided_by: z.string(),
        decide_probabilities: z.record(z.string(), z.number()).nullable(),
        found_by: z.array(z.string()),
        evidence: z.array(source),
        what_to_do: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const { run, runId } = await resolveRun(args);
        const x = explainFinding(run, args.finding_id);
        if (!x) return fail(`No finding "${args.finding_id}" in run ${runId}. Its findings are: ${run.issues.map((i) => i.id).join(", ") || "none"}.`);
        return { content: [{ type: "text", text: explainText(x) }], structuredContent: { run_id: runId, ...x } };
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  server.registerTool(
    "draft_supplier_claim",
    {
      title: "Draft the claim to the supplier",
      description:
        "Returns the email to the supplier that Clocked Fill wrote during the check (in Spanish, with document numbers, quantities and euros), Verify's check of every claim in it, the items to raise and the amount to claim. " +
        "When the invoice is on hold or there is nothing to claim it says what to do instead. It never writes a new email and does not call Clocked again.",
      inputSchema: runRef,
      outputSchema: {
        run_id: z.string(),
        claim_eur: z.number(),
        check_first_eur: z.number(),
        decision: z.string(),
        items: z.array(z.object({ id: z.string(), title: z.string(), amount_eur: z.number(), action: z.string() })),
        email: z.string().nullable(),
        email_written_by: z.string().nullable(),
        email_check: z
          .object({
            verdict: z.string(),
            grounded: z.number(),
            claims: z.array(z.object({ claim: z.string(), verdict: z.string(), supported: z.number(), contradicted: z.number(), not_stated: z.number() })),
          })
          .nullable(),
        owner_summary: z.string().nullable(),
        advice: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const { run, runId } = await resolveRun(args);
        const c = supplierClaim(run);
        return { content: [{ type: "text", text: claimText(c) }], structuredContent: { run_id: runId, ...c } };
      } catch (err) {
        return fail(errorMessage(err));
      }
    },
  );

  log(`ready, ${mode} mode${mode === "live" ? `, credit cap ${liveBudget(env).cap} (${liveBudget(env).remaining} left)` : ", answers from recordings/"}`);
  return server;
}

interface IndexItem {
  caseId: string;
  supplier: string;
  verdict: RunResult["verdict"];
}

function readIndex(): IndexItem[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "runs", "index.json"), "utf8")) as IndexItem[];
  } catch {
    return [];
  }
}

function verdictLine(v: RunResult["verdict"]): string {
  const e = eur;
  if (v.kind === "ready") return `ready to pay ${e(v.payNow)}`;
  if (v.kind === "pay_adjusted") return `pay ${e(v.payNow)}, claim ${e(v.disputed)}${v.pending ? `, check ${e(v.pending)} first` : ""}`;
  if (v.kind === "hold") return "hold payment";
  return "unreadable";
}
