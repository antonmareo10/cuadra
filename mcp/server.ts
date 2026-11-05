/**
 * Cuadra MCP server (stdio).
 *
 *   npm run mcp                         from the repository
 *   node <repo>/mcp/cuadra-mcp.mjs      from any MCP client (Claude Desktop, etc.)
 *
 * Replay mode (default without a key, or CUADRA_MCP_MODE=replay) answers the recorded
 * sample cases with no network. Live mode needs CLOCKED_API_KEY, in the client's `env`
 * or in the repository's .env.local, and stops at CLOCKED_CREDIT_CAP.
 * stdout carries the protocol: everything else is logged to stderr.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// lib/cases.ts and the credit ledger resolve paths from the working directory.
process.chdir(root);

const envFile = path.join(root, ".env.local");
if (process.env.CUADRA_MCP_MODE !== "replay" && fs.existsSync(envFile) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envFile); // values already set by the MCP client win
  } catch {
    process.stderr.write("[cuadra] could not read .env.local; continuing without it\n");
  }
}

const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { createCuadraServer } = await import("./cuadra");

const server = createCuadraServer();
await server.connect(new StdioServerTransport());

process.on("uncaughtException", (err) => process.stderr.write(`[cuadra] uncaught: ${err instanceof Error ? err.message : String(err)}\n`));
process.on("unhandledRejection", (err) => process.stderr.write(`[cuadra] unhandled: ${err instanceof Error ? err.message : String(err)}\n`));
