/**
 * npm run runs
 *
 * Rebuilds public/runs/*.json by replaying recordings/*.json through the current
 * engine: no network, no key, no credits. Use it after changing checks or the UI
 * data shape; if a request changed, the replay fails and asks for `npm run record`.
 */
import fs from "node:fs";
import path from "node:path";
import { ClockedClient, type CallRecord } from "../lib/clocked/client";
import { replayTransport, type Recording } from "../lib/clocked/replay";
import { listCaseIds, loadCase } from "../lib/cases";
import { reconcile } from "../lib/engine/run";
import { writeRun } from "./lib/runs";

async function main() {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : listCaseIds();
  for (const id of ids) {
    const file = path.join(process.cwd(), "recordings", `${id}.json`);
    if (!fs.existsSync(file)) {
      console.log(`${id}: no recording, skipped (run npm run record -- ${id})`);
      continue;
    }
    const rec = JSON.parse(fs.readFileSync(file, "utf8")) as Recording;
    const calls: CallRecord[] = [];
    const client = new ClockedClient({ transport: replayTransport(rec), onCall: (c) => calls.push(c), sleep: async () => {} });
    const result = await reconcile(client, loadCase(id), { calls, source: { kind: "recorded", recordedAt: rec.recordedAt, model: rec.model } });
    // Show the call log as it happened live (wall times, attempts) when the recording has it.
    if (rec.calls && rec.calls.length === calls.length) {
      result.calls = rec.calls;
      result.totals.wallMs = rec.wallMs ?? result.totals.wallMs;
    }
    if (result.errors.length) {
      console.error(`${id}: ${result.errors.join(" | ")}`);
      process.exitCode = 1;
    }
    writeRun(result);
    console.log(`${id.padEnd(22)} ${result.verdict.kind.padEnd(13)} ${calls.length} calls replayed`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
