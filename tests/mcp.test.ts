import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCuadraServer } from "../mcp/cuadra";
import { chooseMode } from "../mcp/runtime";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The MCP server, driven by the SDK's own client. Replay mode only: every Clocked answer
 * comes from the real recordings, so these tests need no key and spend nothing.
 */

type Result = { content: { type: string; text?: string }[]; structuredContent?: any; isError?: boolean };
const text = (r: Result) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

let client: Client;

beforeAll(async () => {
  const server = createCuadraServer({ mode: "replay", env: { CUADRA_MCP_MODE: "replay" }, log: () => {} });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
});

afterAll(async () => {
  await client?.close();
});

const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<Result>;

describe("mode", () => {
  it("is replay without a key or when forced, live with a key", () => {
    expect(chooseMode({})).toBe("replay");
    expect(chooseMode({ CLOCKED_API_KEY: "x", CUADRA_MCP_MODE: "replay" })).toBe("replay");
    expect(chooseMode({ CLOCKED_API_KEY: "x" })).toBe("live");
    expect(chooseMode({ CLOCKED_API_KEY: "  " })).toBe("replay");
  });
});

describe("Cuadra MCP server (in memory, replay)", () => {
  it("lists four tools, each with input and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_documents", "draft_supplier_claim", "explain_finding", "list_sample_cases"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.outputSchema?.type).toBe("object");
      expect(t.description?.length).toBeGreaterThan(60);
    }
    const check = tools.find((t) => t.name === "check_documents")!;
    expect(Object.keys(check.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["case_id", "invoice", "delivery_note", "order", "supplier_id"]));
  });

  it("lists the recorded sample cases", async () => {
    const r = await call("list_sample_cases", {});
    expect(r.isError).toBeFalsy();
    const ids = r.structuredContent.cases.map((c: any) => c.case_id);
    expect(ids).toEqual(expect.arrayContaining(["meat-short-weight", "fish-bank-change", "drinks-vat-return", "veg-duplicate", "clean-substitution"]));
    const meat = r.structuredContent.cases.find((c: any) => c.case_id === "meat-short-weight");
    expect(meat.recorded_verdict).toBe("pay €365.42, claim €42.81, check €18.70 first");
  });

  it("checks the meat case: pay 365.42, claim 42.81, and the finding points to invoice line 13", async () => {
    const r = await call("check_documents", { case_id: "meat-short-weight" });
    expect(r.isError).toBeFalsy();
    const s = r.structuredContent;
    expect(s.source).toMatch(/^recorded run, replayed/);
    expect(s.decision).toMatchObject({ kind: "pay_adjusted", pay_now_eur: 365.42, claim_eur: 42.81, check_first_eur: 18.7 });
    const beef = s.findings.find((f: any) => f.type === "billed_not_delivered" && f.amount_eur === 25.43);
    expect(beef).toBeTruthy();
    const inv = beef.sources.find((x: any) => x.document === "Invoice");
    expect(inv).toMatchObject({ where: "Invoice, line 13", line: 13, quote: "6,000", by: "Extract" });
    expect(inv.line_text).toContain("SOLOMILLO DE TERNERA 6,000 kg");
    expect(beef.sources.find((x: any) => x.document === "Delivery note")).toMatchObject({ line: 12, quote: "5,200" });
    expect(beef.decided_by).toMatch(/^Decide: credit_note/);
    expect(s.clocked.calls).toBe(19);
    expect(text(r)).toContain("Invoice, line 13: CSG-101 SOLOMILLO DE TERNERA 6,000 kg");
    expect(text(r)).toContain("Pay €365.42 now.");
  });

  it("holds the fish invoice: new IBAN, Guard and Inspect flags", async () => {
    const r = await call("check_documents", { case_id: "fish-bank-change" });
    const s = r.structuredContent;
    expect(s.decision.kind).toBe("hold");
    expect(s.decision.pay_now_eur).toBe(0);
    expect(s.findings.map((f: any) => f.type)).toEqual(expect.arrayContaining(["bank_details_changed", "injection", "active_content"]));
    expect(s.findings.every((f: any) => f.severity !== "stop" || /only the owner can clear/.test(f.decided_by))).toBe(true);
    expect(s.safety.guard.find((g: any) => g.document === "Invoice")).toMatchObject({ flagged: true, passage_removed_before_reading: true });
    expect(s.safety.inspect[0]).toMatchObject({ flagged: true, verdict: "malicious" });
    expect(s.safety.bank_account).toMatch(/\+34 942 000 544/);
    const iban = s.findings.find((f: any) => f.type === "bank_details_changed");
    expect(iban.sources[0]).toMatchObject({ document: "Invoice", line: 25 });
  });

  it("explains a finding with its formula and line numbers, without new calls", async () => {
    const check = await call("check_documents", { case_id: "meat-short-weight" });
    const runId = check.structuredContent.run_id;
    const id = check.structuredContent.findings.find((f: any) => f.amount_eur === 25.43).id;
    const r = await call("explain_finding", { run_id: runId, finding_id: id });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.formula).toBe("(6,000 − 5,200) × 28,90 + IVA 10% = 25,43");
    expect(r.structuredContent.evidence.map((e: any) => e.where)).toEqual(expect.arrayContaining(["Invoice, line 13", "Delivery note, line 12"]));
    expect(r.structuredContent.decide_probabilities.credit_note).toBeGreaterThan(0.9);
    expect(text(r)).toContain("What to do: Ask for a credit note of €25.43");
  });

  it("explains a finding of a sample case by case_id", async () => {
    const r = await call("explain_finding", { case_id: "drinks-vat-return", finding_id: "i1" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.type).toBe("vat_rate_wrong");
    expect(r.structuredContent.evidence.some((e: any) => e.document === "Invoice" && typeof e.line === "number")).toBe(true);
  });

  it("drafts the claim: the email Fill wrote and Verify's check", async () => {
    const r = await call("draft_supplier_claim", { case_id: "meat-short-weight" });
    expect(r.isError).toBeFalsy();
    const c = r.structuredContent;
    expect(c.claim_eur).toBe(42.81);
    expect(c.email).toContain("FV-26-04417");
    expect(c.email_written_by).toMatch(/Fill/);
    expect(c.email_check.verdict).toBe("grounded");
    expect(c.items.length).toBe(4);
  });

  it("on a held invoice, says to call the number on file instead of paying", async () => {
    const r = await call("draft_supplier_claim", { case_id: "fish-bank-change" });
    expect(r.structuredContent.advice).toMatch(/Do not pay.*\+34 942 000 544/);
  });

  it("with nothing to claim, says so and invents no email", async () => {
    const r = await call("draft_supplier_claim", { case_id: "clean-substitution" });
    expect(r.structuredContent.email).toBeNull();
    expect(r.structuredContent.advice).toBe("Nothing to claim: pay the invoice.");
    expect(text(r)).toContain("does not make one up");
  });

  it("recognises the sample files given by path and replays their recording", async () => {
    const r = await call("check_documents", {
      order: "data/cases/meat-short-weight/po.txt",
      delivery_note: "data/cases/meat-short-weight/delivery.pdf",
      invoice: path.join(process.cwd(), "data/cases/meat-short-weight/invoice.pdf"),
      supplier_id: "gredos",
    });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent.matched_sample_case).toBe("meat-short-weight");
    expect(r.structuredContent.decision.pay_now_eur).toBe(365.42);
  });

  it("refuses unrecorded documents in replay mode, before sending anything", async () => {
    const r = await call("check_documents", {
      invoice: "data/cases/meat-short-weight/invoice.pdf",
      delivery_note: "data/cases/clean-substitution/delivery.pdf",
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not recorded.*nothing was sent/);
    expect(text(r)).toMatch(/CLOCKED_API_KEY/);
  });

  it("returns tool errors for bad input", async () => {
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ["check_documents", {}, /case_id, or at least the path of the invoice/],
      ["check_documents", { case_id: "nope" }, /Unknown sample case/],
      ["check_documents", { case_id: "../etc" }, /Unknown sample case/],
      ["check_documents", { invoice: "does/not/exist.pdf" }, /File not found/],
      ["check_documents", { invoice: "data" }, /Not a regular file/],
      ["check_documents", { invoice: "package.json" }, /use a PDF, a \.txt file/],
      ["check_documents", { case_id: "meat-short-weight", invoice: "x.pdf" }, /either case_id or file paths/],
      ["explain_finding", { run_id: "missing-1", finding_id: "i1" }, /No run "missing-1"/],
      ["explain_finding", { case_id: "meat-short-weight", finding_id: "i99" }, /No finding "i99".*i1/],
      ["draft_supplier_claim", {}, /run_id from check_documents, or a sample case_id/],
    ];
    for (const [name, args, msg] of cases) {
      const r = await call(name, args);
      expect(r.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
      expect(text(r)).toMatch(msg);
    }
  });
});

describe("live mode keeps the credit cap", () => {
  it("refuses to start a live check when the cap leaves no room, without touching the network", async () => {
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched++;
      throw new Error("network must not be used in tests");
    }) as typeof fetch;
    const server = createCuadraServer({ mode: "live", env: { CLOCKED_API_KEY: "test-key-not-real", CLOCKED_CREDIT_CAP: "0" }, log: () => {} });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const c = new Client({ name: "live-test", version: "1.0.0" });
    await c.connect(b);
    try {
      const r = (await c.callTool({
        name: "check_documents",
        arguments: { invoice: "data/cases/meat-short-weight/invoice.pdf", supplier_id: "gredos" },
      })) as Result;
      expect(r.isError).toBe(true);
      expect(text(r)).toMatch(/credit cap/);
      // A sample case is always the recording, even in live mode: no credits.
      const s = (await c.callTool({ name: "check_documents", arguments: { case_id: "meat-short-weight" } })) as Result;
      expect(s.structuredContent.source).toMatch(/^recorded run, replayed/);
      expect(fetched).toBe(0);
    } finally {
      await c.close();
      globalThis.fetch = realFetch;
    }
  });
});

describe("Cuadra MCP server over stdio", () => {
  it("starts with the launcher, lists tools and checks a case", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(process.cwd(), "mcp", "cuadra-mcp.mjs")],
      env: { ...getDefaultEnvironment(), CUADRA_MCP_MODE: "replay" },
      cwd: path.join(process.cwd(), "docs"), // any folder: the server finds its own repository
      stderr: "pipe",
    });
    const c = new Client({ name: "stdio-test", version: "1.0.0" });
    await c.connect(transport);
    try {
      expect(c.getServerVersion()?.name).toBe("cuadra");
      const { tools } = await c.listTools();
      expect(tools).toHaveLength(4);
      const r = (await c.callTool({ name: "check_documents", arguments: { case_id: "veg-duplicate" } })) as Result;
      expect(r.isError).toBeFalsy();
      expect(r.structuredContent.decision.kind).toBe("hold");
      expect(r.structuredContent.findings[0].type).toBe("duplicate_invoice");
    } finally {
      await c.close();
    }
  }, 60000);
});
