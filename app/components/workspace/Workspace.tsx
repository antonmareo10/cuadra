"use client";

import clsx from "clsx";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Endpoint } from "@/lib/clocked/client";
import { computeVerdict } from "@/lib/engine/checks";
import type { DocKind, Issue, Resolution, RunResult, Verdict } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import { CountUp, EASE, EndpointChip, Icon } from "../ui";
import { CallsTable, DocumentsView, EmailPanel, SafetyPanel } from "./Evidence";
import { IssuesList, LinesTable } from "./IssuesView";

export interface Focus {
  doc: DocKind;
  start?: number;
  end?: number;
  issueId?: string;
  nonce: number;
}

const SECTIONS = [
  { id: "issues", label: "Issues" },
  { id: "lines", label: "Lines" },
  { id: "documents", label: "Documents" },
  { id: "safety", label: "Safety" },
  { id: "email", label: "Record & email" },
  { id: "calls", label: "Clocked calls" },
] as const;

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  const node = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {msg ? (
          <motion.div
            key={msg}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="rounded-full bg-ink px-4 py-2.5 text-[14px] text-paper shadow-card"
          >
            {msg}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
  return { show, node };
}

function VerdictHero({ verdict, run, onReplay }: { verdict: Verdict; run: RunResult; onReplay: () => void }) {
  const invoice = run.documents.find((d) => d.kind === "invoice");
  const stops = run.issues.filter((i) => i.cls === "stop");
  const endpoints = [...new Set(run.calls.map((c) => c.endpoint))];
  const tone =
    verdict.kind === "hold" || verdict.kind === "unreadable" ? "stop" : verdict.kind === "pay_adjusted" ? "warn" : "ok";
  const recorded = run.source.kind === "recorded";
  const when = new Date(run.source.recordedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
  const crossOk =
    verdict.expectedPayable !== null && verdict.kind !== "hold" && Math.abs(verdict.payNow + verdict.pending - verdict.expectedPayable) < 0.06;

  return (
    <section
      aria-label="Verdict"
      className={clsx(
        "relative overflow-hidden rounded-3xl border p-5 shadow-card sm:p-8",
        tone === "stop" && "border-stop/30 bg-stop-soft/60",
        tone === "warn" && "border-warn/30 bg-warn-soft/60",
        tone === "ok" && "border-ok/30 bg-ok-soft/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1">
          <span className={clsx("pulse-dot h-1.5 w-1.5 rounded-full", recorded ? "bg-ok" : "bg-accent")} />
          {recorded ? `Recorded run · ${when}` : `Live run · ${when}`}
        </span>
        {recorded ? <span className="rounded-full bg-surface/80 px-2.5 py-1">replayed instantly, no network</span> : null}
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-2 hover:bg-surface/80 hover:text-ink"
        >
          <Icon name="replay" className="h-3.5 w-3.5" /> Replay the calls
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className={clsx("text-[14px] font-medium", tone === "stop" && "text-stop", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>
            {verdict.kind === "hold"
              ? `Do not pay this invoice. ${stops.length} hard stop${stops.length === 1 ? "" : "s"}.`
              : verdict.kind === "pay_adjusted"
                ? "Pay the undisputed part. Claim the rest."
                : verdict.kind === "ready"
                  ? "Everything matches."
                  : "Nothing is approved without a readable invoice."}
          </p>
          <h1 className="mt-2 text-[clamp(2.2rem,6vw,4.2rem)] font-semibold leading-[1] tracking-[-0.03em]">
            {verdict.kind === "hold" ? (
              <span className="text-stop">Hold payment</span>
            ) : verdict.kind === "unreadable" ? (
              <span className="text-stop">Could not read it</span>
            ) : (
              <>
                {verdict.kind === "ready" ? "Ready to pay " : "Pay "}
                <CountUp value={verdict.payNow} format="eur" />
                {verdict.kind === "pay_adjusted" ? <span className="text-muted"> now</span> : null}
              </>
            )}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
            {run.supplier.name} · invoice {invoice?.header.number?.value ?? "—"} of {invoice?.header.date?.value ?? "—"}
            {verdict.invoiceTotal !== null ? ` · total printed ${eur(verdict.invoiceTotal)}` : ""}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {[
            ["Invoice total", verdict.invoiceTotal ?? 0, "text-ink"],
            ["Claim back", verdict.disputed, verdict.disputed > 0 ? "text-warn" : "text-muted"],
            ["Ask the kitchen", verdict.pending, verdict.pending > 0 ? "text-info" : "text-muted"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="rounded-2xl bg-surface/80 p-3 sm:p-4">
              <dt className="text-[12px] text-muted">{label as string}</dt>
              <dd className={clsx("mt-1 text-lg font-semibold tracking-tight sm:text-2xl", color as string)}>
                <CountUp value={value as number} format="eur" />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-ink/10 pt-5 text-[13px] text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          {verdict.kind === "hold" ? (
            <>
              <Icon name="lock" className="text-stop" /> Held by policy in code. Clear each stop yourself after checking with the supplier.
            </>
          ) : crossOk ? (
            <>
              <Icon name="check" className="text-ok" /> Independent recomputation at agreed prices: {eur(verdict.expectedPayable!)} = pay now
              {verdict.pending > 0 ? " + waiting" : ""}.
            </>
          ) : verdict.expectedPayable !== null ? (
            <>
              <Icon name="info" className="text-info" /> Recomputation at agreed prices: {eur(verdict.expectedPayable)} (your choices below change
              what is paid).
            </>
          ) : null}
        </p>
        <p className="tabular font-mono text-[12px] text-muted">
          {run.totals.calls} Clocked calls · {run.totals.credits} credits · {(run.totals.modelMs / 1000).toFixed(1)} s model time · {endpoints.length}{" "}
          endpoints
        </p>
      </div>
    </section>
  );
}

function RunTimeline({ run, replayKey }: { run: RunResult; replayKey: number }) {
  const byStep: Record<string, Endpoint[]> = {};
  for (const s of run.steps) byStep[s.id] = s.endpoints.filter((e) => run.calls.some((c) => c.endpoint === e));
  const counts = run.calls.reduce<Record<string, number>>((a, c) => ((a[c.endpoint] = (a[c.endpoint] ?? 0) + 1), a), {});
  return (
    <ol key={replayKey} className="space-y-3" aria-label="Run steps">
      {run.steps.map((s, i) => (
        <motion.li
          key={s.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.15 + i * 0.12 }}
          className="relative flex gap-3"
        >
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 20, delay: 0.25 + i * 0.12 }}
            className={clsx(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              s.status === "done" && "bg-ok-soft text-ok",
              s.status === "skipped" && "bg-surface-2 text-muted",
              s.status === "failed" && "bg-stop-soft text-stop",
            )}
          >
            <Icon name={s.status === "failed" ? "stop" : s.status === "skipped" ? "info" : "check"} className="h-3.5 w-3.5" />
          </motion.span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-snug">{s.title}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(byStep[s.id] ?? []).map((e) => (
                <EndpointChip key={e} endpoint={e} count={s.id === "intake" || s.id === "match" ? counts[e] : undefined} />
              ))}
              {s.id === "checks" ? <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">code</span> : null}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{s.note}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

function SectionNav({ active }: { active: string }) {
  return (
    <LayoutGroup id="section-nav">
      <nav aria-label="Sections" className="sticky top-16 z-30 -mx-4 border-b border-line/70 bg-paper/85 px-4 backdrop-blur-md sm:mx-0 sm:rounded-full sm:border sm:px-1.5">
        <ul className="flex gap-1 overflow-x-auto py-1.5 [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <li key={s.id} className="relative shrink-0">
              {active === s.id ? (
                <motion.span layoutId="pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              ) : null}
              <a
                href={`#${s.id}`}
                className={clsx(
                  "relative inline-flex min-h-9 items-center rounded-full px-3.5 text-[14px] transition-colors",
                  active === s.id ? "text-paper" : "text-ink-2 hover:text-ink",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </LayoutGroup>
  );
}

export function Workspace({ run }: { run: RunResult }) {
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() =>
    Object.fromEntries(run.issues.map((i) => [i.id, i.resolution])),
  );
  const issues: Issue[] = useMemo(() => run.issues.map((i) => ({ ...i, resolution: resolutions[i.id] ?? i.resolution })), [run, resolutions]);
  const invoice = run.documents.find((d) => d.kind === "invoice")!;
  const verdict = useMemo(() => computeVerdict(invoice, issues, run.verdict.expectedPayable), [invoice, issues, run.verdict.expectedPayable]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [active, setActive] = useState<string>("issues");
  const toast = useToast();

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((x): x is HTMLElement => Boolean(x));
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const showEvidence = useCallback((f: Omit<Focus, "nonce">) => {
    setFocus({ ...f, nonce: Date.now() });
    document.getElementById("documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setResolution = useCallback(
    (id: string, r: Resolution) => {
      setResolutions((prev) => ({ ...prev, [id]: r }));
      toast.show("Payment recalculated");
    },
    [toast],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/#cases" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-[14px] text-ink-2 hover:text-ink">
          <Icon name="back" /> All cases
        </Link>
        <p className="text-[13px] text-muted">{run.title}</p>
      </div>

      <VerdictHero verdict={verdict} run={run} onReplay={() => setReplayKey((k) => k + 1)} />

      {run.story ? <p className="mt-6 max-w-3xl text-[16px] leading-relaxed text-ink-2">{run.story}</p> : null}
      {run.errors.length ? (
        <div role="alert" className="mt-4 rounded-2xl border border-stop/30 bg-stop-soft p-4 text-[14px] text-stop">
          <p className="font-medium">Some steps did not complete. Nothing that failed was treated as passing.</p>
          <ul className="mt-2 list-disc pl-5">
            {run.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-14">
          <SectionNav active={active} />
          <IssuesList issues={issues} documents={run.documents} onEvidence={showEvidence} onResolve={setResolution} />
          <LinesTable run={run} issues={issues} />
          <DocumentsView run={run} issues={issues} focus={focus} />
          <SafetyPanel run={run} />
          <EmailPanel run={run} onCopy={() => toast.show("Copied to the clipboard")} />
          <CallsTable run={run} replayKey={replayKey} />
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">This run</h2>
            <div className="mt-4">
              <RunTimeline run={run} replayKey={replayKey} />
            </div>
          </div>
        </aside>
      </div>
      {toast.node}
    </div>
  );
}
