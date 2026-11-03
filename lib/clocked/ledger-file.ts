import fs from "node:fs";
import path from "node:path";
import type { LedgerEntry, LedgerStore } from "./budget";

/**
 * Append-only credit ledger on disk (`.clocked/ledger.jsonl`, git-ignored).
 * It survives between script runs, so the credit cap covers smoke tests,
 * recordings and local live runs together.
 */
export class FileLedger implements LedgerStore {
  constructor(private readonly file: string = path.join(process.cwd(), ".clocked", "ledger.jsonl")) {}

  load(): LedgerEntry[] {
    if (!fs.existsSync(this.file)) return [];
    return fs
      .readFileSync(this.file, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as LedgerEntry];
        } catch {
          return [];
        }
      });
  }

  append(entry: LedgerEntry): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, JSON.stringify(entry) + "\n", "utf8");
  }
}
