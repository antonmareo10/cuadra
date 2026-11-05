#!/usr/bin/env node
// Launcher for MCP clients: registers tsx (resolved from this repository, whatever the
// client's working directory is) and starts the TypeScript server.
//   { "command": "node", "args": ["/path/to/cuadra/mcp/cuadra-mcp.mjs"] }
import { register } from "tsx/esm/api";

register();
await import("./server.ts");
