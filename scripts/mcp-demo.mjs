// npm run mcp:demo [-- case-id] [-- --save]
//
// A real MCP client session over stdio against the Cuadra server, in replay mode (no key,
// no credits): lists the tools, checks a sample case (meat-short-weight by default),
// explains its top finding and drafts the claim to the supplier. Prints the transcript;
// --save also writes it to docs/mcp-transcript.txt.
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = process.cwd();
const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, "mcp", "cuadra-mcp.mjs")],
  env: { ...getDefaultEnvironment(), CUADRA_MCP_MODE: "replay" },
  stderr: "ignore",
});
const client = new Client({ name: "cuadra-demo-client", version: "1.0.0" });
await client.connect(transport);

const info = client.getServerVersion();
say(`# MCP session with ${info?.name} ${info?.version} over stdio (replay mode: real Clocked recordings, no network)`);
say();
const { tools } = await client.listTools();
say(`> tools/list`);
for (const t of tools) say(`  ${t.name}: ${t.title ?? ""}`);
say();

async function call(name, args) {
  say(`> tools/call ${name} ${JSON.stringify(args)}`);
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  say(text.split("\n").map((l) => `  ${l}`).join("\n"));
  say();
  return r;
}

const caseId = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "meat-short-weight";
const check = await call("check_documents", { case_id: caseId });
if (check.isError) process.exit(1);
const runId = check.structuredContent.run_id;
const top = check.structuredContent.findings[0].id;
await call("explain_finding", { run_id: runId, finding_id: top });
await call("draft_supplier_claim", { run_id: runId });

await client.close();
if (process.argv.includes("--save")) {
  fs.writeFileSync(path.join(root, "docs", "mcp-transcript.txt"), out.join("\n") + "\n");
  console.error("saved docs/mcp-transcript.txt");
}
