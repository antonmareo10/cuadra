"use client";

import clsx from "clsx";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Endpoint } from "@/lib/clocked/client";
import { computeVerdict } from "@/lib/engine/checks";
import type { DocKind, Issue, Resolution, RunResult, Verdict } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import { endpointsUsed } from "@/lib/ui/endpoints";
import { picturesFor, type CaseLayout } from "@/lib/ui/paper";
import { EASE, EndpointChip, Icon, Stamp } from "../ui";
import { CountUp } from "../ui-motion";
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
            className="rounded-[2px] bg-ink px-4 py-2.5 text-[14px] text-paper shadow-card"
          >
            {msg}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
  return { show, node };
}

/** The stamp for a verdict: what a bookkeeper would press on the invoice. */
function verdictStamp(verdict: Verdict): { text: string; sub: string; tone: "accent" | "ok" | "info" } {
  if (verdict.kind === "hold") return { text: "Do not pay", sub: "held in code", tone: "accent" };
  if (verdict.kind === "unreadable") return { text: "Unreadable", sub: "nothing approved", tone: "accent" };
  if (verdict.waitingForPhoto) return { text: "Look first", sub: "read from a photo", tone: "info" };
  if (verdict.kind === "pay_adjusted") return { text: "Claim", sub: `${eur(verdict.disputed)} back`, tone: "accent" };
  return { text: "OK to pay", sub: "every line matches", tone: "ok" };
}

function VerdictHero({ verdict, run, onReplay }: { verdict: Verdict; run: RunResult; onReplay: () => void }) {
  const invoice = run.documents.find((d) => d.kind === "invoice");
  const stops = run.issues.filter((i) => i.cls === "stop");
  const endpoints = endpointsUsed(run.calls.map((c) => c.endpoint));
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
  // The double-ruled total is drawn only when the column really adds up.
  const sums =
    verdict.invoiceTotal !== null && verdict.kind !== "hold" && verdict.kind !== "unreadable" && !verdict.waitingForPhoto &&
    Math.abs(verdict.invoiceTotal - verdict.disputed - verdict.pending - verdict.payNow) < 0.01;
  const stamp = verdictStamp(verdict);

  return (
    <div className="relative z-10 mt-5 -mb-28 sm:mt-6">
      <section aria-label="Verdict" className="perf-top bg-surface px-5 pb-6 pt-8 text-ink shadow-[0_44px_60px_-40px_rgb(4_8_40/0.8)] sm:px-8 sm:pt-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pr-24 font-mono text-[11.5px] text-muted sm:pr-48">
          <span className="inline-flex items-center gap-2">
            <span className={clsx("pulse-dot h-1.5 w-1.5 rounded-full", recorded ? "bg-ok" : "bg-accent")} />
            {recorded ? `Recorded run · ${when}` : `Live run · ${when}`}
          </span>
          {recorded ? <span>replayed instantly, no network</span> : null}
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex min-h-9 items-center gap-1.5 border border-line px-2.5 text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <Icon name="replay" className="h-3.5 w-3.5" /> Replay the calls
          </button>
        </div>

        <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <div className="min-w-0 lg:col-span-8">
            <p className={clsx("text-[14.5px] font-semibold", tone === "stop" && "text-stop", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>
              {verdict.kind === "hold"
                ? `Do not pay this invoice. ${stops.length} hard stop${stops.length === 1 ? "" : "s"}.`
                : verdict.waitingForPhoto
                  ? "The delivery note was read from a photo. Nothing is paid until you have looked at it."
                  : verdict.kind === "pay_adjusted"
                    ? "Pay the undisputed part. Claim the rest."
                    : verdict.kind === "ready"
                      ? "Everything matches."
                      : "Nothing is approved without a readable invoice."}
            </p>
            <h1 className="mt-3 font-display text-[clamp(2.3rem,4.7vw,4.6rem)] leading-[0.92]">
              {verdict.kind === "hold" ? (
                <span className="text-stop">Hold payment</span>
              ) : verdict.kind === "unreadable" ? (
                <span className="text-stop">Could not read it</span>
              ) : verdict.waitingForPhoto ? (
                <>
                  <span className="text-muted">Check the photo, then pay </span>
                  <CountUp value={verdict.waitingForPhoto} format="eur" />
                </>
              ) : (
                <>
                  {verdict.kind === "ready" ? "Ready to pay " : "Pay "}
                  <CountUp value={verdict.payNow} format="eur" />
                  {verdict.kind === "pay_adjusted" ? <span className="text-muted"> now</span> : null}
                </>
              )}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2">
              {run.supplier.name} · invoice {invoice?.header.number?.value ?? "(number not read)"}
              {invoice?.header.date?.value ? ` of ${invoice.header.date.value}` : ""}
              {verdict.invoiceTotal !== null ? ` · total printed ${eur(verdict.invoiceTotal)}` : ""}
            </p>
          </div>
          <dl className="font-mono text-[13px] lg:col-span-4">
            {[
              ["Invoice total", verdict.invoiceTotal ?? 0, "text-ink", ""],
              ["Claim back", verdict.disputed, verdict.disputed > 0 ? "text-warn" : "text-muted", sums ? "− " : ""],
              [verdict.waitingForPhoto ? "Waiting for you" : "Ask the kitchen", verdict.pending, verdict.pending > 0 ? "text-info" : "text-muted", sums ? "− " : ""],
            ].map(([label, value, color, sign]) => (
              <div key={label as string} className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-2.5">
                <dt className="font-sans text-[14px] text-ink-2">{label as string}</dt>
                <dd className={clsx("text-[16px] font-semibold sm:text-[18px]", color as string)}>
                  {sign as string}
                  <CountUp value={value as number} format="eur" />
                </dd>
              </div>
            ))}
            {sums ? (
              <div className="dbl-top mt-1 flex items-baseline justify-between gap-4 border-ink pt-2.5">
                <dt className="font-sans text-[14px] font-semibold">Pay now</dt>
                <dd className="text-[18px] font-bold sm:text-[20px]">
                  <CountUp value={verdict.payNow} format="eur" />
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-line pt-4 text-[13px] text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            {verdict.kind === "hold" ? (
              <>
                <Icon name="lock" className="text-stop" /> Held by policy in code. Clear each stop yourself after checking with the supplier.
              </>
            ) : verdict.waitingForPhoto ? (
              <>
                <Icon name="review" className="text-info" /> Read without character positions. Look at the photo below, then mark it checked.
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
          <p className="tabular font-mono text-[11.5px] text-muted">
            {run.totals.calls} Clocked calls · {run.totals.credits} credits · {(run.totals.modelMs / 1000).toFixed(1)} s model time · {endpoints.length}{" "}
            endpoints
          </p>
        </div>
      </section>
      <span className="pointer-events-none absolute -top-4 right-3 text-[clamp(1.15rem,3.2vw,2.4rem)] sm:right-8 lg:-top-6">
        <Stamp key={`${verdict.kind}-${verdict.disputed}-${verdict.pending}`} rotate={-7} delay={380} tone={stamp.tone} sub={stamp.sub}>
          {stamp.text}
        </Stamp>
      </span>
    </div>
  );
}

function RunTimeline({ run, replayKey }: { run: RunResult; replayKey: number }) {
  const used = new Set(endpointsUsed(run.calls.map((c) => c.endpoint)));
  const byStep: Record<string, Endpoint[]> = {};
  for (const s of run.steps) byStep[s.id] = s.endpoints.filter((e) => used.has(e));
  const counts = run.calls.reduce<Record<string, number>>((a, c) => ((a[c.endpoint] = (a[c.endpoint] ?? 0) + 1), a), {});
  // Guard and Extract also run once inside every Pipeline call.
  counts.injection = (counts.injection ?? 0) + (counts.pipeline ?? 0);
  counts.extract = (counts.extract ?? 0) + (counts.pipeline ?? 0);
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
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px]",
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
              {s.id === "checks" ? <span className="rounded-[2px] border border-line px-2 py-0.5 font-mono text-[11px] text-muted">code</span> : null}
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
      <nav aria-label="Sections" className="sticky top-14 z-30 -mx-[var(--gutter)] border-b border-ink/15 bg-paper/95 px-[calc(var(--gutter)-0.75rem)] backdrop-blur-md sm:top-16 lg:mx-0 lg:px-0">
        <ul className="flex overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <li key={s.id} className="relative shrink-0">
              {active === s.id ? (
                <motion.span layoutId="tab-rule" className="absolute inset-x-3 -bottom-px h-[3px] bg-accent" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              ) : null}
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={clsx("relative inline-flex min-h-12 items-center px-3 text-[14px] transition-colors", active === s.id ? "font-semibold text-ink" : "text-muted hover:text-ink")}
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

/** The three documents as they arrived, small, at the top of the case. */
function ArrivedStrip({ run, layout, onOpen }: { run: RunResult; layout: CaseLayout; onOpen: (doc: DocKind) => void }) {
  const pics = picturesFor(run, layout);
  if (!pics.length) return null;
  const order: DocKind[] = ["po", "delivery", "invoice"];
  return (
    <section aria-label="The documents as they arrived" className="mt-8">
      <p className="font-mono text-[11.5px] text-muted">As they arrived</p>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:gap-5">
        {order
          .map((k) => pics.find((p) => p.kind === k))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p, i) => {
            const doc = run.documents.find((d) => d.kind === p.kind)!;
            return (
              <li key={p.kind} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpen(p.kind)}
                  className="group block w-full text-left transition-transform duration-300 hover:-translate-y-1"
                >
                  <span className="block aspect-[4/3] overflow-hidden bg-[#dfe2ea] shadow-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      style={{ objectPosition: p.form === "chat" ? "50% 60%" : p.form === "photo" ? "55% 40%" : "50% 0%" }}
                    />
                  </span>
                  <span className="block pt-2.5 text-[12.5px] leading-snug sm:text-[13.5px]">
                    <span className="block truncate font-semibold">
                      <span className="font-mono text-[11px] font-normal text-accent">{String(i + 1).padStart(2, "0")}</span> {doc.label}
                    </span>
                    <span className="hidden truncate font-mono text-[11px] text-muted sm:block">{p.form === "photo" ? "phone photo, read in image mode" : p.form === "chat" ? "chat export, plain text" : "PDF with a text layer"}</span>
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

export function Workspace({ run, layout = {} }: { run: RunResult; layout?: CaseLayout }) {
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
    // Land on the picture and the text side by side, not on the section's heading.
    (document.getElementById("doc-view") ?? document.getElementById("documents"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setResolution = useCallback(
    (id: string, r: Resolution) => {
      setResolutions((prev) => ({ ...prev, [id]: r }));
      toast.show("Payment recalculated");
    },
    [toast],
  );

  return (
    // reducedMotion="user": with prefers-reduced-motion, motion skips movement and keeps plain fades.
    <MotionConfig reducedMotion="user">
    <div className="desk-grid text-on-desk">
      <div className="shell pt-4 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <Link href="/#cases" className="-ml-1 inline-flex min-h-11 items-center gap-2 px-1 text-[14px] font-medium text-white decoration-[1.5px] underline-offset-[6px] hover:underline">
            <Icon name="back" /> All cases
          </Link>
          <p className="font-mono text-[11.5px] text-white/80">{run.title}</p>
        </div>
        <VerdictHero verdict={verdict} run={run} onReplay={() => setReplayKey((k) => k + 1)} />
      </div>
    </div>
    <div className="shell pb-24 pt-36">
      {run.story ? <p className="max-w-3xl text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">{run.story}</p> : null}
      <ArrivedStrip run={run} layout={layout} onOpen={(doc) => showEvidence({ doc })} />
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

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="min-w-0 space-y-14">
          <SectionNav active={active} />
          <IssuesList issues={issues} documents={run.documents} onEvidence={showEvidence} onResolve={setResolution} />
          <LinesTable run={run} issues={issues} />
          <DocumentsView run={run} issues={issues} focus={focus} layout={layout} />
          <SafetyPanel run={run} />
          <EmailPanel run={run} onCopy={() => toast.show("Copied to the clipboard")} />
          <CallsTable run={run} replayKey={replayKey} />
        </div>
        <aside className="hidden lg:block">
          <div className="perf-top torn-bottom sticky top-24 bg-surface px-5 pb-9 pt-7 shadow-card">
            <h2 className="font-mono text-[11.5px] text-muted">This run · {run.totals.calls} Clocked calls</h2>
            <div className="mt-4">
              <RunTimeline run={run} replayKey={replayKey} />
            </div>
          </div>
        </aside>
      </div>
      {toast.node}
    </div>
    </MotionConfig>
  );
}
