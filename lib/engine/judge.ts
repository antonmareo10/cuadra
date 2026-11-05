import type { ClockedClient } from "../clocked/client";
import { decideRequest, PRIORITY_LEVELS } from "./requests";
import { DOC_LABEL, type Issue, type Resolution } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const UNCERTAIN = 0.6;

export function issueNarrative(i: Issue): string {
  const ev = dedupeEvidence(i.evidence)
    .filter((e) => e.quote)
    .slice(0, 8)
    .map((e) => `- ${e.doc in DOC_LABEL ? DOC_LABEL[e.doc as keyof typeof DOC_LABEL] : e.doc} (${e.by}): "${e.quote}"`)
    .join("\n");
  return [
    `Discrepancy: ${i.title}.`,
    i.detail,
    i.math ? `Computation: ${i.math}.` : "",
    i.amount > 0 ? `Amount at stake: ${i.amount.toFixed(2)} EUR including VAT.` : "No amount is at stake.",
    ev ? `Evidence from the documents:\n${ev}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Decide triages every discrepancy that needs judgement in ONE request: each issue
 * is a document, with two questions scoped to it (what to do, how urgent).
 * Hard stops (fraud signals, duplicates, unreadable invoice) are not sent: the
 * policy in code holds those payments regardless of any model output.
 */
export async function judgeIssues(client: ClockedClient, issues: Issue[]): Promise<number> {
  // A photo read is never sent: whether the owner has looked at the photo is not a model's call.
  const items = issues.filter((i) => (i.cls === "money" || i.cls === "review") && i.type !== "read_from_photo");
  if (!items.length) return 0;
  const { data } = await client.call<any>(
    "decide",
    decideRequest(items.map((i) => ({ id: i.id, text: issueNarrative(i) }))),
    `Decide · ${items.length} discrepanc${items.length === 1 ? "y" : "ies"}`,
  );
  const answers = data?.answers ?? {};
  for (const i of items) {
    const a = answers[`${i.id}__action`];
    const pr = answers[`${i.id}__priority`];
    if (!a?.choice) continue;
    const probs: Record<string, number> = a.probabilities ?? {};
    const confidence = Number(a.confidence ?? Math.max(...Object.values(probs).map(Number), 0));
    const priority = Number(pr?.score ?? 0);
    const level = Math.max(0, Math.min(PRIORITY_LEVELS.length - 1, Math.round(priority)));
    i.decision = {
      action: a.choice as Resolution,
      probabilities: probs,
      confidence,
      priority,
      priorityLabel: PRIORITY_LEVELS[level].split(":")[0],
      uncertain: confidence < UNCERTAIN,
    };
    // An uncertain call is left for the owner instead of being applied.
    i.resolution = i.decision.uncertain ? "confirm" : i.decision.action;
  }
  return items.length;
}

/** Same document + same quote = one piece of evidence, crediting every endpoint that found it. */
export function dedupeEvidence(list: Issue["evidence"]): Issue["evidence"] {
  const out: Issue["evidence"] = [];
  for (const e of list) {
    const q = e.quote.trim();
    if (!q) continue;
    const same = out.find((x) => x.doc === e.doc && x.quote.trim() === q);
    if (same) {
      if (!same.by.split(" · ").includes(e.by)) same.by = `${same.by} · ${e.by}`;
      if (same.start === undefined && e.start !== undefined) {
        same.start = e.start;
        same.end = e.end;
      }
    } else out.push({ ...e });
  }
  return out;
}

/** Stops first, then Decide's priority level, then money at stake. */
export function rankIssues(issues: Issue[]): Issue[] {
  const clsRank = { stop: 0, money: 1, review: 1, info: 3 } as const;
  return [...issues].sort(
    (a, b) =>
      clsRank[a.cls] - clsRank[b.cls] ||
      Math.round(b.decision?.priority ?? (b.cls === "info" ? -1 : 0)) - Math.round(a.decision?.priority ?? (a.cls === "info" ? -1 : 0)) ||
      b.amount - a.amount,
  );
}
