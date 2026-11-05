import fs from "node:fs";
import path from "node:path";
import type { Endpoint } from "../clocked/client";
import type { RunResult, Verdict } from "../engine/types";
import type { CaseLayout } from "../ui/paper";

/** Build-time readers for the recorded runs and the page layouts (server components only). */

export interface IndexItem {
  caseId: string;
  title: string;
  story: string;
  supplier: string;
  verdict: Verdict;
  issues: number;
  endpoints: Endpoint[];
  calls: number;
  credits: number;
  recordedAt: string;
}

const PUBLIC = path.join(process.cwd(), "public");
const safe = (id: string) => /^[a-z0-9-]+$/.test(id);

export function loadIndex(): IndexItem[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC, "runs", "index.json"), "utf8"));
  } catch {
    return [];
  }
}

export function loadRun(id: string): RunResult | null {
  if (!safe(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC, "runs", `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function loadLayout(id: string): CaseLayout {
  if (!safe(id)) return {};
  try {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC, "paper", id, "layout.json"), "utf8"));
  } catch {
    return {};
  }
}

/** A run without the heavy redacted PDFs (they stay downloadable from the case page's own data). */
export function lightRun(run: RunResult): RunResult {
  return { ...run, documents: run.documents.map((d) => ({ ...d, redactedPdf: undefined })) };
}
