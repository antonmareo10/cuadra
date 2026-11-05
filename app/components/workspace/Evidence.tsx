"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeIban } from "@/lib/engine/text";
import type { DocKind, Issue, ReadDocument, RunResult, VerifiedClaim } from "@/lib/engine/types";
import { marksFor, segmentLines } from "@/lib/ui/highlight";
import { EASE, EndpointChip, ENDPOINT_NAME, Icon, ProbabilityBar, Reveal } from "../ui";
import type { Focus } from "./Workspace";

const DOC_ORDER: DocKind[] = ["invoice", "delivery", "po"];

function DocText({ doc, issues, focus, shareSafe }: { doc: ReadDocument; issues: Issue[]; focus: Focus | null; shareSafe: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const marks = useMemo(() => marksFor(doc, issues), [doc, issues]);
  const focused = focus && focus.doc === doc.kind ? focus : null;
  const fStart = focused?.start;
  const fEnd = focused?.end;
  const lines = useMemo(
    () => segmentLines(doc.text, marks, fStart !== undefined && fEnd !== undefined ? [fStart, fEnd] : []),
    [doc.text, marks, fStart, fEnd],
  );

  useEffect(() => {
    if (!focused || !box.current) return;
    const el = box.current.querySelector<HTMLElement>("mark.m-focus");
    if (el) {
      const top = el.offsetTop - box.current.clientHeight / 3;
      box.current.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, [focused, focused?.nonce]);

  if (shareSafe) {
    return (
      <div ref={box} className="doc-text max-h-[520px] overflow-auto rounded-xl bg-paper p-4 text-ink-2">
        {doc.anonymizedText ?? "Protect returned no share-safe copy for this document."}
      </div>
    );
  }
  const inFocus = (s: { start: number; end: number }) => fStart !== undefined && fEnd !== undefined && s.start < fEnd && s.end > fStart;
  return (
    <div ref={box} className="doc-text relative max-h-[520px] overflow-auto rounded-xl bg-paper py-3 text-ink-2" tabIndex={0} aria-label={`${doc.label} text, with line numbers`}>
      {lines.map((l) => (
        <div key={l.n} className={clsx("doc-line", l.segments.some(inFocus) && "doc-line-focus")}>
          <span className="doc-ln" aria-hidden>
            {l.n}
          </span>
          <span className="min-w-0">
            {l.segments.length
              ? l.segments.map((s) => {
                  const isFocus = inFocus(s);
                  if (!s.marks.length && !isFocus) return <span key={s.key}>{s.text}</span>;
                  const top = s.marks[0];
                  return (
                    <mark
                      key={s.key}
                      className={clsx(top && `m-${top.kind}`, isFocus && "m-focus")}
                      title={s.marks.length ? [...new Set(s.marks.map((m) => m.label))].join("\n") : undefined}
                    >
                      {s.text}
                    </mark>
                  );
                })
              : "\u00a0"}
          </span>
        </div>
      ))}
    </div>
  );
}

function downloadBase64Pdf(b64: string, name: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DocumentsView({ run, issues, focus }: { run: RunResult; issues: Issue[]; focus: Focus | null }) {
  const docs = DOC_ORDER.map((k) => run.documents.find((d) => d.kind === k)).filter((d): d is ReadDocument => Boolean(d));
  const [tab, setTab] = useState<DocKind>(docs[0]?.kind ?? "invoice");
  const [shareSafe, setShareSafe] = useState(false);
  useEffect(() => {
    if (focus) {
      setTab(focus.doc);
      setShareSafe(false);
    }
  }, [focus]);
  const doc = docs.find((d) => d.kind === tab) ?? docs[0];
  if (!doc) return null;
  const fields = Object.values(doc.header).filter((f) => f.value).length;
  const recorded = run.source.kind === "recorded";

  return (
    <section id="documents" className="scroll-mt-32" aria-labelledby="docs-h">
      <Reveal>
        <h2 id="docs-h" className="text-2xl font-semibold tracking-tight">
          The documents, as Clocked read them
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          This is the PDF&apos;s own text layer, numbered line by line. Underlined: values Extract copied, by position. Boxed: personal data
          Protect found. Amber and red: evidence behind an issue. Hover a mark to see who found it.
        </p>
      </Reveal>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Documents" className="flex flex-wrap gap-1 rounded-full bg-surface-2 p-1">
            {docs.map((d) => (
              <button
                key={d.kind}
                role="tab"
                aria-selected={tab === d.kind}
                onClick={() => setTab(d.kind)}
                className={clsx("relative min-h-9 rounded-full px-3.5 text-[13.5px]", tab === d.kind ? "text-paper" : "text-ink-2 hover:text-ink")}
              >
                {tab === d.kind ? <motion.span layoutId="doc-tab" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
                <span className="relative">{d.label}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-2 text-ink-2">
              <input type="checkbox" checked={shareSafe} onChange={(e) => setShareSafe(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Share-safe copy
            </label>
            {recorded ? (
              <a
                href={`/cases/${run.caseId}/${doc.fileName}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <Icon name="external" className="h-3.5 w-3.5" /> Original
              </a>
            ) : null}
            {doc.redactedPdf ? (
              <button
                type="button"
                onClick={() => downloadBase64Pdf(doc.redactedPdf!, `${doc.kind}-redacted.pdf`)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <Icon name="download" className="h-3.5 w-3.5" /> Redacted PDF
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 px-1 text-[12.5px] text-muted">
          {doc.mode === "plain" ? "Plain text" : `PDF, ${doc.pages} page${doc.pages === 1 ? "" : "s"}, text layer`} · {fields} header values and {doc.lines.length}{" "}
          lines read by Extract{doc.repairs ? ` · ${doc.repairs} empty cell${doc.repairs === 1 ? "" : "s"} re-read inside their line` : ""} · {doc.pii.length} personal-data
          spans found by Protect
          {doc.sanitized ? " · read with the flagged passage blanked out" : ""}
        </p>
        <div className="mt-3">
          <DocText doc={doc} issues={issues} focus={focus} shareSafe={shareSafe} />
        </div>
        {shareSafe ? (
          <p className="mt-2 px-1 text-[12.5px] text-muted">
            Protect replaced names and emails and masked phones and bank accounts (last four digits kept). Use this copy, or the redacted PDF, when you send
            the pack outside the restaurant.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function SafetyPanel({ run }: { run: RunResult }) {
  const docs = DOC_ORDER.map((k) => run.documents.find((d) => d.kind === k)).filter((d): d is ReadDocument => Boolean(d));
  const invoice = run.documents.find((d) => d.kind === "invoice");
  const ibanIssue = run.issues.find((i) => i.type === "bank_details_changed");
  const invoiceIbans = invoice?.pii.filter((p) => p.type === "bank_account") ?? [];
  const pairs = run.relations.filter((r) => r.a === "invoice" || r.b === "invoice" || (r.a === "delivery-note" && r.b === "order") || (r.a === "order" && r.b === "delivery-note"));
  const label = (id: string) => (id === "order" ? "Order" : id === "delivery-note" ? "Delivery note" : id === "invoice" ? "Invoice" : id.replace("earlier-", "Earlier invoice "));

  return (
    <section id="safety" className="scroll-mt-32" aria-labelledby="safety-h">
      <Reveal>
        <h2 id="safety-h" className="text-2xl font-semibold tracking-tight">
          Safety checks
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">Run on every document before anything else reads it. A flag here holds the payment in code.</p>
      </Reveal>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Reveal className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold tracking-tight">Instructions aimed at AI</h3>
            <EndpointChip endpoint="injection" />
          </div>
          <ul className="mt-4 space-y-3">
            {docs.map((d) => (
              <li key={d.kind} className="text-[14px]">
                <div className="flex items-center justify-between gap-3">
                  <span>{d.label}</span>
                  {d.guard ? (
                    <span className={clsx("rounded-full px-2 py-0.5 text-[12px]", d.guard.flagged ? "bg-stop-soft text-stop" : "bg-ok-soft text-ok")}>
                      {d.guard.flagged ? `${d.guard.category} · ${d.guard.severity}` : "benign"}
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted">not screened</span>
                  )}
                </div>
                {d.guard ? <ProbabilityBar value={d.guard.injection} tone={d.guard.flagged ? "stop" : "ok"} label="injection probability" /> : null}
                {d.guard?.flagged
                  ? d.guard.evidence.map((e, i) => (
                      <blockquote key={i} className="mt-2 rounded-lg border-l-2 border-stop bg-stop-soft/60 px-3 py-2 text-[13px] text-ink-2">
                        “{e.quote}”
                      </blockquote>
                    ))
                  : null}
              </li>
            ))}
          </ul>
          {docs.some((d) => d.guard?.flagged) ? (
            <p className="mt-3 text-[12.5px] text-muted">The Pipeline stopped at Guard; the document was then read with those lines blanked out, offsets unchanged.</p>
          ) : null}
        </Reveal>

        <Reveal delay={0.05} className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold tracking-tight">Scripts inside PDFs</h3>
            <EndpointChip endpoint="script" />
          </div>
          <ul className="mt-4 space-y-3 text-[14px]">
            {docs
              .filter((d) => d.mime === "application/pdf")
              .map((d) => (
                <li key={d.kind}>
                  <div className="flex items-center justify-between gap-3">
                    <span>{d.label}</span>
                    {d.scripts.length ? (
                      <span className={clsx("rounded-full px-2 py-0.5 text-[12px]", d.inspect?.flagged || !d.inspect ? "bg-stop-soft text-stop" : "bg-ok-soft text-ok")}>
                        {d.inspect ? `${d.inspect.verdict} · ${d.inspect.category}` : "script, not checked"}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted">no scripts, Inspect not needed</span>
                    )}
                  </div>
                  {d.inspect ? (
                    <>
                      <ProbabilityBar value={d.inspect.malicious} tone={d.inspect.flagged ? "stop" : "ok"} label="malicious probability" />
                      <pre tabIndex={0} aria-label="Script found in the PDF" className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-2">
                        {d.inspect.evidence.map((e) => e.line).join("\n") || d.scripts[0]?.script}
                      </pre>
                    </>
                  ) : null}
                </li>
              ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted">Scripts are found in code without running them; only what is found is sent to Inspect.</p>
        </Reveal>

        <Reveal className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold tracking-tight">Personal data and bank details</h3>
            <EndpointChip endpoint="pii" />
          </div>
          <ul className="mt-4 space-y-2 text-[14px]">
            {docs.map((d) => {
              const counts = d.pii.reduce<Record<string, number>>((a, p) => ((a[p.type] = (a[p.type] ?? 0) + 1), a), {});
              return (
                <li key={d.kind} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{d.label}</span>
                  <span className="flex flex-wrap gap-1">
                    {Object.entries(counts).map(([t, n]) => (
                      <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2">
                        {t.replace("_", " ")} ×{n}
                      </span>
                    ))}
                    {!d.pii.length ? <span className="text-[12px] text-muted">none found</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className={clsx("mt-4 rounded-xl p-3 text-[13.5px]", ibanIssue ? "bg-stop-soft text-stop" : "bg-ok-soft text-ok")}>
            {ibanIssue ? (
              <p className="flex gap-2">
                <Icon name="stop" className="mt-0.5" /> {ibanIssue.detail}
              </p>
            ) : invoiceIbans.length ? (
              <p className="flex gap-2">
                <Icon name="check" className="mt-0.5" /> Invoice IBAN ending {normalizeIban(invoiceIbans[0].value).slice(-4)} matches the IBAN on file ({run.supplier.ibanOnFileTail}).
              </p>
            ) : (
              <p className="flex gap-2 text-ink-2">
                <Icon name="info" className="mt-0.5" /> No bank account was found on the invoice.
              </p>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.05} className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold tracking-tight">Duplicates and contradictions</h3>
            <EndpointChip endpoint="compare" />
          </div>
          <ul className="mt-4 space-y-3 text-[14px]">
            {pairs.map((r) => {
              const p = r.probabilities[r.relation] ?? 0;
              const dup = r.relation === "same" && (r.a.startsWith("earlier") || r.b.startsWith("earlier"));
              return (
                <li key={`${r.a}-${r.b}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink-2">
                    {label(r.a)} <span className="text-muted">↔</span> {label(r.b)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[12px]",
                        dup ? "bg-stop-soft text-stop" : r.relation === "conflicting" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2",
                      )}
                    >
                      {dup ? "same invoice" : r.relation}
                    </span>
                    <span className="tabular font-mono text-[11px] text-muted">{Math.round(p * 100)}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted">
            One Compare request reads every pair of this purchase&apos;s documents and the supplier&apos;s earlier invoices. “Same” against an earlier invoice
            holds the payment.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function ClaimText({ text, claims }: { text: string; claims: VerifiedClaim[] }) {
  // Mark each verified claim where it appears in the email.
  const parts: { s: string; claim?: VerifiedClaim }[] = [];
  const sorted = claims
    .map((c) => ({ c, i: text.indexOf(c.claim) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i);
  let cursor = 0;
  for (const { c, i } of sorted) {
    if (i < cursor) continue;
    parts.push({ s: text.slice(cursor, i) });
    parts.push({ s: c.claim, claim: c });
    cursor = i + c.claim.length;
  }
  parts.push({ s: text.slice(cursor) });
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
      {parts.map((p, i) =>
        p.claim ? (
          <span
            key={i}
            title={`Verify: ${p.claim.verdict.replace("_", " ")} (${Math.round(p.claim.supported * 100)}% supported)${p.claim.evidence ? `\n“${p.claim.evidence.quote}”` : ""}`}
            className={clsx(
              "rounded px-0.5 decoration-2 underline-offset-4",
              p.claim.verdict === "supported" ? "underline decoration-ok/60" : p.claim.verdict === "contradicted" ? "bg-stop-soft underline decoration-stop" : "bg-warn-soft underline decoration-warn",
            )}
          >
            {p.s}
          </span>
        ) : (
          <span key={i}>{p.s}</span>
        ),
      )}
    </p>
  );
}

export function EmailPanel({ run, onCopy }: { run: RunResult; onCopy: () => void }) {
  const r = run.record;
  const check = r?.emailCheck;
  const bad = check?.claims.filter((c) => c.verdict !== "supported") ?? [];
  const copy = async () => {
    if (!r?.emailToSupplier) return;
    try {
      await navigator.clipboard.writeText(r.emailToSupplier);
      onCopy();
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
  };
  const topProb = (probs: Record<string, number>, v: string | null) => (v ? (probs[v] ?? 0) : 0);
  return (
    <section id="email" className="scroll-mt-32" aria-labelledby="email-h">
      <Reveal>
        <h2 id="email-h" className="text-2xl font-semibold tracking-tight">
          The record, and the email to the supplier
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Fill writes both from the checks above, never from scratch. Verify then checks every claim of the email against the documents.
        </p>
      </Reveal>
      {!r ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface p-5 text-[15px] text-muted">No record was filled for this run.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Reveal className="min-w-0 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold tracking-tight">Reconciliation record</h3>
              <EndpointChip endpoint="fill" />
            </div>
            <dl className="mt-4 space-y-4 text-[14px]">
              <div>
                <dt className="text-[12px] text-muted">Recommended status</dt>
                <dd className="mt-1 font-medium">{r.recommendedStatus.value ?? "—"}</dd>
                <dd className="mt-1">
                  <ProbabilityBar value={topProb(r.recommendedStatus.probabilities, r.recommendedStatus.value)} label="probability" />
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted">Credit note needed</dt>
                <dd className="mt-1 font-medium">{r.creditNoteNeeded.value === null ? "—" : r.creditNoteNeeded.value ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted">Bookkeeping category</dt>
                <dd className="mt-1 font-medium">{r.expenseCategory.value ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted">For the owner</dt>
                <dd className="mt-1 leading-relaxed text-ink-2">{r.ownerSummary ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[12px] text-muted">Generated text is marked as generated by Fill; amounts come from the checks.</p>
          </Reveal>

          <Reveal delay={0.05} className="min-w-0 rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold tracking-tight">Email to {run.supplier.name}</h3>
              <span className="flex gap-1">
                <EndpointChip endpoint="fill" />
                {check ? <EndpointChip endpoint="grounding" /> : null}
              </span>
            </div>
            {r.emailToSupplier ? (
              <>
                <div
                  className={clsx(
                    "mt-4 flex items-start gap-2 rounded-xl p-3 text-[13.5px]",
                    !check ? "bg-surface-2 text-ink-2" : bad.length ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok",
                  )}
                >
                  <Icon name={!check ? "info" : bad.length ? "review" : "check"} className="mt-0.5" />
                  <p>
                    {!check
                      ? "Not verified."
                      : bad.length
                        ? `Edit before sending: ${bad.length} claim${bad.length === 1 ? " is" : "s are"} not supported by the documents.`
                        : `Every claim is supported by the documents (Verify: ${check.verdict.replace(/_/g, " ")}, ${Math.round(check.grounded * 100)}% grounded).`}
                  </p>
                </div>
                <div className="mt-4 rounded-xl bg-paper p-4">
                  <ClaimText text={r.emailToSupplier} claims={check?.claims ?? []} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-paper transition-transform active:scale-[0.97]"
                  >
                    <Icon name="copy" /> Copy email
                  </button>
                  <p className="text-[12.5px] text-muted">
                    Send it to the address you already have for the supplier{run.issues.some((i) => i.type === "bank_details_changed") ? `, and call ${run.supplier.phoneOnFile} before paying` : ""}.
                    Nothing is sent from here.
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-4 text-[15px] text-ink-2">Nothing to raise with the supplier, so no email was written.</p>
            )}
          </Reveal>
        </div>
      )}
      {run.supplierClaim ? (
        <Reveal className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold tracking-tight">What the supplier wrote on the invoice</h3>
            <EndpointChip endpoint="grounding" />
          </div>
          <ul className="mt-3 space-y-2 text-[14px]">
            {run.supplierClaim.claims.map((c, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-ink-2">“{c.claim}”</span>
                <span className={clsx("rounded-full px-2 py-0.5 text-[12px]", c.verdict === "supported" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                  {c.verdict === "supported" ? "supported by your records" : `${c.verdict.replace("_", " ")} in your records`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted">Checked against the agreed tariff and the order. “Not stated” means your records do not show it, not that it is false.</p>
        </Reveal>
      ) : null}
    </section>
  );
}

export function CallsTable({ run, replayKey }: { run: RunResult; replayKey: number }) {
  return (
    <section id="calls" className="scroll-mt-32" aria-labelledby="calls-h">
      <Reveal>
        <h2 id="calls-h" className="text-2xl font-semibold tracking-tight">
          Every Clocked call in this run
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Each request carries its own Idempotency-Key; retries reuse it, so a retry is never billed twice. Credits are the X-Clocked-Credits header of
          each response, counted against a hard cap before anything is sent.
        </p>
      </Reveal>
      <div tabIndex={0} role="region" aria-label="Table of Clocked calls, scrolls sideways on small screens" className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="border-b border-line text-[12px] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">Endpoint</th>
              <th className="px-3 py-3 font-medium">What it was for</th>
              <th className="px-3 py-3 text-right font-medium">Credits</th>
              <th className="px-3 py-3 text-right font-medium">Model ms</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody key={replayKey} className="tabular">
            {run.calls.map((c, i) => (
              <motion.tr
                key={c.id + i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, ease: EASE, delay: replayKey ? i * 0.06 : 0 }}
                className="border-b border-line/70 last:border-0"
              >
                <td className="px-4 py-2.5 font-mono text-muted">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <EndpointChip endpoint={c.endpoint} />
                </td>
                <td className="px-3 py-2.5 text-ink-2">{c.label.replace(`${ENDPOINT_NAME[c.endpoint]} · `, "")}</td>
                <td className="px-3 py-2.5 text-right font-mono">{c.credits ?? "—"}</td>
                <td className="px-3 py-2.5 text-right font-mono">{c.modelMs !== null ? Math.round(c.modelMs) : "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={clsx("rounded-full px-2 py-0.5 text-[12px]", c.ok ? "bg-ok-soft text-ok" : "bg-stop-soft text-stop")}>{c.ok ? c.status : c.error?.kind ?? "failed"}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line text-[13px]">
            <tr>
              <td className="px-4 py-3" />
              <td className="px-3 py-3 font-medium" colSpan={2}>
                {run.totals.calls} calls · {[...new Set(run.calls.map((c) => c.endpoint))].length} endpoints
              </td>
              <td className="px-3 py-3 text-right font-mono font-medium">{run.totals.credits}</td>
              <td className="px-3 py-3 text-right font-mono font-medium">{run.totals.modelMs}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        {run.source.kind === "recorded"
          ? `Recorded live${run.source.model ? ` on ${run.source.model}` : ""}; this page replays the stored responses through the same engine. The free trial bills nothing (cost basis “reference”).`
          : "Live run from this server."}
      </p>
    </section>
  );
}
