import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Endpoint } from "@/lib/clocked/client";
import type { RunResult, Verdict } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import { SITE } from "@/lib/site";
import { accountProof, amountProof, type ProofItem } from "@/lib/ui/proof";
import { Hero } from "./components/Hero";
import { SiteFooter, SiteHeader } from "./components/Chrome";
import { endpointsUsed } from "@/lib/ui/endpoints";
import { CountUp, EndpointChip, Icon, Reveal } from "./components/ui";

interface IndexItem {
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

const RUNS = path.join(process.cwd(), "public", "runs");

function loadIndex(): IndexItem[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(RUNS, "index.json"), "utf8"));
  } catch {
    return [];
  }
}

function loadRun(id: string): RunResult | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(RUNS, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** The two findings in the hero, read from the recordings at build time. */
function loadProof(): ProofItem[] {
  const meat = loadRun("meat-short-weight");
  const fish = loadRun("fish-bank-change");
  return [meat && amountProof(meat), fish && accountProof(fish)].filter((p): p is ProofItem => Boolean(p));
}

/** What a hand check would have paid, against what Cuadra says. */
function BeforeAfter({ v }: { v: Verdict }) {
  if (v.invoiceTotal === null) return null;
  const after =
    v.kind === "hold" ? "hold, pay nothing yet" : v.kind === "ready" ? `pay ${eur(v.payNow)}` : `pay ${eur(v.payNow)}, claim ${eur(v.disputed)}`;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
      <span className="text-muted">Printed {eur(v.invoiceTotal)}</span>
      <Icon name="arrow" className="h-3.5 w-3.5 text-muted" />
      <span className="font-medium text-ink">{after}</span>
    </p>
  );
}

function VerdictPill({ v }: { v: Verdict }) {
  if (v.kind === "hold")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-stop-soft px-2.5 py-1 text-[13px] font-medium text-stop">
        <Icon name="stop" className="h-3.5 w-3.5" /> Hold payment
      </span>
    );
  if (v.kind === "pay_adjusted")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[13px] font-medium text-warn">
        <Icon name="money" className="h-3.5 w-3.5" /> Claim {eur(v.disputed)}
      </span>
    );
  if (v.kind === "ready")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[13px] font-medium text-ok">
        <Icon name="check" className="h-3.5 w-3.5" /> Ready to pay
      </span>
    );
  return <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-muted">Unreadable</span>;
}

const STEPS: { n: string; title: string; endpoints: Endpoint[]; body: string }[] = [
  {
    n: "01",
    title: "Screen every file before anything reads it",
    endpoints: ["pii", "script", "injection", "pipeline"],
    body: "Protect finds staff names, phones and bank accounts and returns a redacted PDF you can share. Inspect judges any script hidden in a PDF. Guard screens each document for text aimed at AI assistants, as the first step of a Pipeline that stops before reading if it fires.",
  },
  {
    n: "02",
    title: "Read what the documents say, verbatim",
    endpoints: ["extract"],
    body: "Extract copies every header value and line with its exact position in the source, so every number on screen points back to where it was printed. A cell the first read leaves empty is re-read inside its own line. Nothing is guessed.",
  },
  {
    n: "03",
    title: "Match the chef's order to the supplier's lines",
    endpoints: ["rerank"],
    body: "Orders are WhatsApp messages and handwritten sheets without supplier codes. Rerank decides which order line each invoiced product is, and says when a near match is a different product, like cherry tomatoes for plum tomatoes.",
  },
  {
    n: "04",
    title: "Do the arithmetic in code",
    endpoints: [],
    body: "Billed against delivered and returned, price against the agreed tariff, VAT against the tariff, lines against totals. Every euro withheld has a formula and an independent recomputation that must agree.",
  },
  {
    n: "05",
    title: "Cross-examine documents and claims",
    endpoints: ["compare", "grounding"],
    body: "Compare reads every pair of documents and earlier invoices: the same delivery invoiced twice, or a delivery note that contradicts the invoice. Verify tests what the supplier wrote, such as a 'new tariff communicated on 15/10', against your records.",
  },
  {
    n: "06",
    title: "Triage, fill the record, check the email",
    endpoints: ["decide", "fill", "grounding"],
    body: "Decide recommends an action and a priority for each discrepancy, with probabilities; uncertain calls are left to you. Fill writes the reconciliation record and the email to the supplier, and Verify checks every claim in that email against the documents before you copy it.",
  },
];

export default function Home() {
  const items = loadIndex();
  const proof = loadProof();
  const claimed = items.reduce((a, i) => a + i.verdict.disputed, 0);
  const held = items.filter((i) => i.verdict.kind === "hold");
  const avgCalls = items.length ? Math.round(items.reduce((a, i) => a + i.calls, 0) / items.length) : 0;
  const avgCredits = items.length ? Math.round(items.reduce((a, i) => a + i.credits, 0) / items.length) : 0;
  const endpoints = new Set(endpointsUsed(items.flatMap((i) => i.endpoints)));
  const recordedOn = items[0]?.recordedAt
    ? new Date(items[0].recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })
    : null;

  const stats = (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-line pt-8 sm:grid-cols-4">
      <div>
        <dt className="text-[13px] text-muted">To claim back across {items.length} sample invoices</dt>
        <dd className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={claimed} format="eur" />
        </dd>
      </div>
      <div>
        <dt className="text-[13px] text-muted">Invoices held before paying</dt>
        <dd className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={held.length} format="int" />
          <span className="ml-2 align-middle text-[13px] font-normal text-muted">fraud, duplicate</span>
        </dd>
      </div>
      <div>
        <dt className="text-[13px] text-muted">Clocked calls per invoice</dt>
        <dd className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={avgCalls} format="int" />
          <span className="ml-2 align-middle text-[13px] font-normal text-muted">{endpoints.size} endpoints</span>
        </dd>
      </div>
      <div>
        <dt className="text-[13px] text-muted">Credits per invoice, measured</dt>
        <dd className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          <CountUp value={avgCredits} format="approx" />
        </dd>
      </div>
    </dl>
  );

  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero stats={stats} proof={proof} video={SITE.video} />

        <section id="cases" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Five recorded cases</h2>
            <p className="mt-3 max-w-2xl text-ink-2">
              Synthetic documents from a fictional Madrid tavern, each with problems planted on purpose. Every run is a real Clocked
              recording{recordedOn ? ` from ${recordedOn}` : ""}, replayed instantly. Nothing on these pages waits for the network.
            </p>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <Reveal as="li" key={it.caseId} delay={i * 0.06}>
                <Link
                  href={`/case/${it.caseId}`}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgb(27_26_23/0.35)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <VerdictPill v={it.verdict} />
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-ok" /> recorded run
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold leading-snug tracking-tight">{it.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{it.story}</p>
                  <BeforeAfter v={it.verdict} />
                  <p className="mt-4 text-[13px] text-muted">{it.supplier}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {endpointsUsed(it.endpoints).map((e) => (
                      <EndpointChip key={e} endpoint={e} />
                    ))}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium">
                    Open the case
                    <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </Reveal>
            ))}
            <Reveal as="li" delay={items.length * 0.06}>
              <Link
                href="/check"
                className="group flex h-full flex-col justify-between rounded-2xl border border-dashed border-line p-5 transition-colors hover:bg-surface"
              >
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-ink-2">
                    <Icon name="file" className="h-3.5 w-3.5" /> Your own documents
                  </span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">Run a live reconciliation</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                    Upload an invoice, a delivery note and an order (PDF with a text layer, or a WhatsApp export). Runs live against
                    Clocked when the server has a key.
                  </p>
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium">
                  Try it <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          </ul>
        </section>

        <section id="how" className="border-y border-line bg-surface/60">
          <div className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How one invoice is checked</h2>
              <p className="mt-3 max-w-2xl text-ink-2">
                15 to 19 Clocked calls per invoice, 11 to 24 seconds end to end in the recorded runs. Each endpoint changes what happens
                next. None is there for show.
              </p>
            </Reveal>
            <ol className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-2">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} delay={(i % 2) * 0.06}>
                  <div className="flex gap-4">
                    <span className="font-mono text-sm text-muted">{s.n}</span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.endpoints.length ? (
                          s.endpoints.map((e) => <EndpointChip key={e} endpoint={e} />)
                        ) : (
                          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">no model</span>
                        )}
                      </div>
                      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">What it will not do</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              ["It never approves what it could not read.", "A scan without a text layer, or a file with no invoice total, is reported as unreadable and held. A photo of your cat does not come back “matched”."],
              ["Detectors are not the lock.", "Guard and Inspect raise flags; the hold is enforced in code, and only you can clear it after calling the supplier on the number you already had."],
              ["It does not invent prices or bank details.", "Agreed prices, VAT rates and the IBAN on file come from your own supplier records. Missing data stays missing and is shown as such."],
              ["Uncertain calls are yours.", "When Decide is less than 60% sure about an action, Cuadra does not apply it and asks you instead."],
            ].map(([t, b], i) => (
              <Reveal key={t} delay={i * 0.05} className="rounded-2xl border border-line bg-surface p-5">
                <h3 className="font-semibold tracking-tight">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{b}</p>
              </Reveal>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
