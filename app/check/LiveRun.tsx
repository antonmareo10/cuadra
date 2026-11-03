"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { CallRecord } from "@/lib/clocked/client";
import type { DocKind, RunResult, RunStep } from "@/lib/engine/types";
import { EASE, EndpointChip, Icon } from "../components/ui";
import { Workspace } from "../components/workspace/Workspace";

type Status = { live: boolean; reason: string | null } | null;
type Slot = { kind: DocKind; label: string; hint: string; required?: boolean; accept: string };

const SLOTS: Slot[] = [
  { kind: "invoice", label: "Invoice", hint: "PDF with a text layer", required: true, accept: "application/pdf" },
  { kind: "delivery", label: "Delivery note", hint: "PDF with a text layer", accept: "application/pdf" },
  { kind: "po", label: "Order", hint: "PDF, or a WhatsApp export (.txt)", accept: "application/pdf,text/plain,.txt" },
];

const SUPPLIERS = [
  { id: "", name: "No supplier record (skip tariff and IBAN checks)" },
  { id: "huerta", name: "Huerta del Jarama S.L. (vegetables)" },
  { id: "gredos", name: "Cárnicas Sierra de Gredos S.L. (meat)" },
  { id: "ribera", name: "Bebidas Ribera Distribución S.L. (drinks)" },
  { id: "bahia", name: "Pescados Bahía Norte S.A. (fish)" },
];

const SAMPLES = [
  { id: "meat-short-weight", name: "Meat, short weight" },
  { id: "fish-bank-change", name: "Fish, bank change" },
  { id: "drinks-vat-return", name: "Drinks, VAT and a return" },
  { id: "veg-duplicate", name: "Vegetables, duplicate" },
  { id: "clean-substitution", name: "Vegetables, substitution" },
];

async function readFile(f: File): Promise<{ mime: string; data: string }> {
  if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mime: "application/pdf", data: btoa(bin) };
  }
  return { mime: "text/plain", data: await f.text() };
}

export function LiveRun() {
  const [status, setStatus] = useState<Status>(null);
  const [files, setFiles] = useState<Partial<Record<DocKind, File>>>({});
  const [supplierId, setSupplierId] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ live: false, reason: "Could not reach the server." }));
  }, []);

  async function start(body: unknown) {
    setPhase("running");
    setError(null);
    setCalls([]);
    setSteps([]);
    setResult(null);
    try {
      const res = await fetch("/api/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `The server answered ${res.status}.`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "call") setCalls((c) => [...c, ev.call]);
          else if (ev.type === "step") setSteps((s) => [...s, ev.step]);
          else if (ev.type === "result") {
            setResult(ev.result);
            setPhase("done");
            finished = true;
          } else if (ev.type === "error") throw new Error(ev.message);
        }
      }
      if (!finished) throw new Error("The run ended without a result.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run failed.");
      setPhase("error");
    }
  }

  async function runUpload() {
    const documents = [];
    for (const s of SLOTS) {
      const f = files[s.kind];
      if (!f) continue;
      const { mime, data } = await readFile(f);
      documents.push({ kind: s.kind, fileName: f.name, mime, data });
    }
    await start({ mode: "upload", supplierId: supplierId || null, documents });
  }

  if (phase === "done" && result) {
    return (
      <div>
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <button type="button" onClick={() => setPhase("idle")} className="inline-flex min-h-11 items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
            <Icon name="back" /> New live run
          </button>
        </div>
        <Workspace run={result} />
      </div>
    );
  }

  const live = status?.live;
  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Run a live reconciliation</h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
        The same engine as the recorded cases, against Clocked in real time: 15 to 20 calls and 10 to 20 seconds. Files go to Clocked for reading and are not
        stored by this app.
      </p>

      {status && !live ? (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <p className="flex items-center gap-2 font-medium">
            <Icon name="info" className="text-info" /> Live runs are not available here
          </p>
          <p className="mt-2 text-[15px] text-ink-2">{status.reason} The recorded cases show real Clocked output and need nothing.</p>
          <p className="mt-3 text-[14px] text-ink-2">To run live on your machine:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12.5px] text-ink-2">
            {`echo CLOCKED_API_KEY=your-key > .env.local\nnpm install && npm run dev\n# open http://localhost:3000/check`}
          </pre>
        </div>
      ) : null}

      <fieldset disabled={!live || phase === "running"} className={clsx("mt-8 space-y-8", !live && "opacity-60")}>
        <div>
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">A sample case, live</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => start({ mode: "sample", caseId: s.id })}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] hover:bg-surface-2"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">Or your own files</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {SLOTS.map((s) => {
              const f = files[s.kind];
              return (
                <label
                  key={s.kind}
                  className={clsx(
                    "flex min-h-32 cursor-pointer flex-col justify-between rounded-2xl border border-dashed p-4 transition-colors hover:bg-surface",
                    f ? "border-ok/50 bg-ok-soft/40" : "border-line",
                  )}
                >
                  <span>
                    <span className="font-medium">{s.label}</span>
                    {s.required ? <span className="ml-1 text-[12px] text-accent">required</span> : <span className="ml-1 text-[12px] text-muted">optional</span>}
                    <span className="mt-1 block text-[13px] text-muted">{s.hint}</span>
                  </span>
                  <span className="mt-3 truncate text-[13px] text-ink-2">{f ? f.name : "Choose a file"}</span>
                  <input
                    type="file"
                    accept={s.accept}
                    className="sr-only"
                    onChange={(e) => setFiles((prev) => ({ ...prev, [s.kind]: e.target.files?.[0] }))}
                  />
                </label>
              );
            })}
          </div>
          <label className="mt-4 block text-[14px]">
            <span className="text-ink-2">Supplier record on file (agreed tariff, IBAN, phone)</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-1.5 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] sm:w-auto"
            >
              {SUPPLIERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!files.invoice}
            onClick={runUpload}
            className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            Reconcile live <Icon name="arrow" />
          </button>
        </div>
      </fieldset>

      <AnimatePresence>
        {phase === "running" || phase === "error" ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mt-10 rounded-2xl border border-line bg-surface p-5"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 font-medium">
              {phase === "running" ? <span className="pulse-dot h-2 w-2 rounded-full bg-accent" /> : <Icon name="stop" className="text-stop" />}
              {phase === "running" ? `Working · ${calls.length} Clocked calls so far` : "The run stopped"}
            </p>
            {error ? <p className="mt-2 text-[14px] text-stop">{error}</p> : null}
            <ul className="mt-4 space-y-1.5">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-[14px]">
                  <Icon name={s.status === "failed" ? "stop" : "check"} className={s.status === "failed" ? "text-stop" : "text-ok"} /> {s.title}
                  <span className="text-[12px] text-muted">{s.note}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {calls.map((c, i) => (
                  <motion.li key={c.id + i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, ease: EASE }}>
                    <EndpointChip endpoint={c.endpoint} className={c.ok ? "" : "ring-1 ring-stop"} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
