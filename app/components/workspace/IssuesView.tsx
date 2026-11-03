"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { normalizeCode } from "@/lib/engine/text";
import type { DocKind, Issue, ReadDocument, Resolution, RunResult } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import { EASE, Icon, ProbabilityBar, Reveal, SourceChip } from "../ui";
import type { Focus } from "./Workspace";

const DOC_SHORT: Record<string, string> = { po: "Order", delivery: "Delivery note", invoice: "Invoice", history: "Earlier invoice", tariff: "Agreed tariff", checks: "Checks" };

const ACTION_LABEL: Record<Resolution, string> = {
  accept: "Accept",
  credit_note: "Claim credit",
  confirm: "Ask kitchen",
  hold: "Hold",
};

const ACTION_SENTENCE: Record<string, string> = {
  accept: "accept and pay",
  credit_note: "pay the rest and claim a credit note",
  confirm: "ask the kitchen first",
  hold: "hold everything",
};

const CLS_STYLE = {
  stop: { icon: "stop" as const, ring: "border-stop/35", badge: "bg-stop-soft text-stop", label: "Hard stop" },
  money: { icon: "money" as const, ring: "border-warn/35", badge: "bg-warn-soft text-warn", label: "Money" },
  review: { icon: "review" as const, ring: "border-info/35", badge: "bg-info-soft text-info", label: "Needs a look" },
  info: { icon: "info" as const, ring: "border-line", badge: "bg-surface-2 text-muted", label: "Note" },
};

function IssueCard({
  issue,
  index,
  onEvidence,
  onResolve,
}: {
  issue: Issue;
  index: number;
  onEvidence: (f: Omit<Focus, "nonce">) => void;
  onResolve: (id: string, r: Resolution) => void;
}) {
  const st = CLS_STYLE[issue.cls];
  const d = issue.decision;
  const options: Resolution[] = issue.cls === "stop" ? ["hold", "accept"] : ["accept", "credit_note", "confirm", "hold"];
  const evidence = issue.evidence.filter((e) => e.quote);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -6% 0px" }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index, 6) * 0.05 }}
      className={clsx("rounded-2xl border bg-surface p-4 shadow-card sm:p-5", st.ring, issue.resolution === "accept" && issue.cls !== "info" && "opacity-80")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", st.badge)}>
            <Icon name={st.icon} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{st.label}</p>
            <h3 className="mt-0.5 text-[16px] font-semibold leading-snug tracking-tight sm:text-[17px]">{issue.title}</h3>
          </div>
        </div>
        {issue.amount > 0 ? (
          <p className={clsx("tabular shrink-0 text-right text-lg font-semibold tracking-tight", issue.resolution === "accept" ? "text-muted line-through decoration-1" : "text-ink")}>
            {eur(issue.amount)}
            <span className="block text-[11px] font-normal text-muted no-underline">incl. VAT</span>
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{issue.detail}</p>
      {issue.math ? <p className="tabular mt-3 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-ink-2">{issue.math}</p> : null}

      {evidence.length ? (
        <div className="mt-4">
          <p className="text-[12px] font-medium text-muted">Where it says so</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {evidence.slice(0, 8).map((e, i) => {
              const clickable = (e.doc === "po" || e.doc === "delivery" || e.doc === "invoice") && e.start !== undefined;
              const body = (
                <>
                  <span className="font-medium text-ink">{DOC_SHORT[e.doc] ?? e.doc}</span>
                  <span className="truncate text-ink-2">“{e.quote.length > 90 ? `${e.quote.slice(0, 88)}…` : e.quote}”</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-muted">{e.by}</span>
                </>
              );
              return (
                <li key={i} className="max-w-full">
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => onEvidence({ doc: e.doc as DocKind, start: e.start, end: e.end, issueId: issue.id })}
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-line bg-paper px-2.5 py-1 text-left text-[12.5px] transition-colors hover:border-ink/30 hover:bg-surface-2"
                      title="Show in the document"
                    >
                      {body}
                    </button>
                  ) : (
                    <span className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1 text-[12.5px]">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-[13px]">
          {d ? (
            <div>
              <p className="text-ink-2">
                <span className="font-medium text-ink">Decide:</span> {ACTION_SENTENCE[d.action] ?? d.action}
                <span className="text-muted"> · priority {d.priorityLabel.toLowerCase()}</span>
                {d.uncertain ? <span className="ml-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] text-info">unsure, your call</span> : null}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(d.probabilities)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([k, p]) => (
                    <span key={k} className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                      {ACTION_LABEL[k as Resolution] ?? k}
                      <ProbabilityBar value={p} tone={k === d.action ? "ink" : "info"} label={`${ACTION_LABEL[k as Resolution] ?? k} probability`} />
                    </span>
                  ))}
              </div>
            </div>
          ) : issue.cls === "stop" ? (
            <p className="flex items-center gap-1.5 text-ink-2">
              <Icon name="lock" className="h-3.5 w-3.5 text-stop" /> Policy in code holds the payment. No model decides this.
            </p>
          ) : (
            <p className="text-muted">Informational.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {issue.sources.map((s) => (
              <SourceChip key={s} source={s} />
            ))}
          </div>
        </div>
        {issue.cls !== "info" ? (
          <div role="radiogroup" aria-label={`Action for ${issue.title}`} className="flex shrink-0 flex-wrap gap-1 rounded-full bg-surface-2 p-1">
            {options.map((o) => {
              const label = issue.cls === "stop" ? (o === "hold" ? "Hold" : "I checked it") : ACTION_LABEL[o];
              const on = issue.resolution === o;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onResolve(issue.id, o)}
                  className={clsx(
                    "relative min-h-9 rounded-full px-3 text-[13px] transition-colors",
                    on ? "bg-ink text-paper" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </motion.li>
  );
}

export function IssuesList({
  issues,
  onEvidence,
  onResolve,
}: {
  issues: Issue[];
  documents: ReadDocument[];
  onEvidence: (f: Omit<Focus, "nonce">) => void;
  onResolve: (id: string, r: Resolution) => void;
}) {
  const main = issues.filter((i) => i.cls !== "info");
  const notes = issues.filter((i) => i.cls === "info");
  return (
    <section id="issues" className="scroll-mt-32" aria-labelledby="issues-h">
      <Reveal>
        <h2 id="issues-h" className="text-2xl font-semibold tracking-tight">
          {main.length ? `${main.length} thing${main.length === 1 ? "" : "s"} to look at, most urgent first` : "Nothing to raise"}
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Hard stops first, then Decide&apos;s priority, then money at stake. Change any action and the amount to pay updates.
        </p>
      </Reveal>
      {main.length ? (
        <ul className="mt-6 space-y-4">
          {main.map((i, n) => (
            <IssueCard key={i.id} issue={i} index={n} onEvidence={onEvidence} onResolve={onResolve} />
          ))}
        </ul>
      ) : (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok-soft/60 p-5 text-ok">
          <Icon name="check" className="h-5 w-5" />
          <p className="text-[15px]">Every invoiced line matches the order and the signed delivery note at the agreed price and VAT.</p>
        </div>
      )}
      {notes.length ? (
        <div className="mt-6">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-muted">Notes</h3>
          <ul className="mt-2 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="flex gap-2 text-[14px] text-ink-2">
                <Icon name="info" className="mt-0.5 text-muted" /> <span><span className="font-medium text-ink">{n.title}.</span> {n.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function qty(n: number | null | undefined, unit?: string | null) {
  if (n === null || n === undefined) return "—";
  const s = Number.isInteger(n) ? String(n) : n.toLocaleString("en-GB", { maximumFractionDigits: 3 });
  return unit ? `${s} ${unit}` : s;
}

export function LinesTable({ run, issues }: { run: RunResult; issues: Issue[] }) {
  const inv = run.documents.find((d) => d.kind === "invoice");
  const dn = run.documents.find((d) => d.kind === "delivery");
  const po = run.documents.find((d) => d.kind === "po");
  if (!inv) return null;
  const tariff = new Map(run.supplier.tariff.products.map((t) => [normalizeCode(t.code), t]));
  const rows = run.matches.map((m) => {
    const L = inv.lines[m.invoiceLine];
    const D = m.deliveryLine !== null ? dn?.lines[m.deliveryLine] : undefined;
    const P = m.poLine !== null ? po?.lines[m.poLine] : undefined;
    const T = m.tariffCode ? tariff.get(m.tariffCode) : undefined;
    const lineIssues = issues.filter((i) => i.invoiceLine === m.invoiceLine && i.cls !== "info");
    const worst = lineIssues.find((i) => i.cls === "money" && i.resolution !== "accept") ?? lineIssues.find((i) => i.resolution !== "accept") ?? lineIssues[0];
    const best = m.poCandidates.find((c) => c.index === m.poLine);
    const closest = m.closestDifferent ? po?.lines[m.closestDifferent.index] : undefined;
    return { m, L, D, P, T, worst, best, closest };
  });
  return (
    <section id="lines" className="scroll-mt-32" aria-labelledby="lines-h">
      <Reveal>
        <h2 id="lines-h" className="text-2xl font-semibold tracking-tight">
          Line by line
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Delivery lines are matched by product code. Order lines are matched by Rerank, because the order is written by the chef, not the
          supplier.
        </p>
      </Reveal>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="border-b border-line text-[12px] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Invoiced product</th>
              <th className="px-3 py-3 font-medium">Order line (Rerank)</th>
              <th className="px-3 py-3 text-right font-medium">Ordered</th>
              <th className="px-3 py-3 text-right font-medium">Delivered</th>
              <th className="px-3 py-3 text-right font-medium">Invoiced</th>
              <th className="px-3 py-3 text-right font-medium">Price · agreed</th>
              <th className="px-3 py-3 text-right font-medium">VAT · agreed</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map(({ m, L, D, P, T, worst, best, closest }) => {
              const priceOff = T && L.unitPrice.number != null && L.unitPrice.number - (P?.unitPrice.number ?? T.price) > 0.005;
              const vatOff = T && L.vatRate.number != null && Math.abs(L.vatRate.number - T.vat) > 0.01;
              const qtyOff = D && L.quantity.number != null && D.quantity.number != null && L.quantity.number - D.quantity.number > 0.0005;
              return (
                <tr key={m.invoiceLine} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.name}</span>
                    <span className="block font-mono text-[11px] text-muted">{L.code.value ?? "no code"}</span>
                  </td>
                  <td className="px-3 py-3 text-ink-2">
                    {P ? (
                      <span className="flex flex-col gap-1">
                        <span>“{P.description.value}”</span>
                        {best ? <ProbabilityBar value={best.relevance} tone="ok" label="Rerank: same product" /> : null}
                      </span>
                    ) : closest ? (
                      <span className="flex flex-col gap-1">
                        <span className="text-info">Not ordered · closest “{closest.description.value}”</span>
                        <ProbabilityBar value={m.closestDifferent!.relevance} tone="info" label="Rerank: same product" />
                      </span>
                    ) : po ? (
                      <span className="text-info">Not on the order</span>
                    ) : (
                      <span className="text-muted">No order</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{P ? qty(P.quantity.number, P.unit.value) : "—"}</td>
                  <td className={clsx("px-3 py-3 text-right", qtyOff && "font-semibold text-warn")}>{D ? qty(D.quantity.number, D.unit.value) : dn ? "not delivered" : "—"}</td>
                  <td className={clsx("px-3 py-3 text-right", qtyOff && "font-semibold text-warn")}>{qty(L.quantity.number, L.unit.value)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={clsx(priceOff && "font-semibold text-warn")}>{L.unitPrice.number != null ? eur(L.unitPrice.number) : "—"}</span>
                    <span className="block text-[11px] text-muted">{T ? eur(P?.unitPrice.number ?? T.price) : "—"}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={clsx(vatOff && "font-semibold text-warn")}>{L.vatRate.number != null ? `${L.vatRate.number}%` : "—"}</span>
                    <span className="block text-[11px] text-muted">{T ? `${T.vat}%` : "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    {worst ? (
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2 py-0.5 text-[12px]",
                          worst.resolution === "accept" ? "bg-ok-soft text-ok" : worst.cls === "money" ? "bg-warn-soft text-warn" : worst.cls === "stop" ? "bg-stop-soft text-stop" : "bg-info-soft text-info",
                        )}
                      >
                        {worst.resolution === "accept" ? "accepted" : worst.type.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] text-ok">
                        <Icon name="check" className="h-3 w-3" /> matches
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
