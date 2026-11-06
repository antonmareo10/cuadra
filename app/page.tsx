import Link from "next/link";
import type { Endpoint } from "@/lib/clocked/client";
import type { RunResult, Verdict } from "@/lib/engine/types";
import { CASES } from "@/data/world";
import { eur } from "@/lib/money";
import { loadIndex, loadLayout, loadRun, type IndexItem } from "@/lib/server/data";
import { SITE } from "@/lib/site";
import { endpointsUsed } from "@/lib/ui/endpoints";
import { boxForSpan, type Box, type CaseLayout } from "@/lib/ui/paper";
import { accountProof, amountProof, type ProofSource } from "@/lib/ui/proof";
import { SiteFooter, SiteHeader } from "./components/Chrome";
import { MondayPile, type PileSheet } from "./components/landing/MondayPile";
import { DocCrop, PageCut } from "./components/paper/DocCrop";
import { EndpointChip, Icon, Reveal } from "./components/ui";

function crop(run: RunResult, layout: CaseLayout, s: ProofSource | undefined) {
  if (!s) return null;
  const doc = run.documents.find((d) => d.kind === s.kind);
  const page = layout[s.kind];
  if (!doc || !page) return null;
  const at = boxForSpan(doc, page, s.start, s.end);
  return at ? { ...at, page } : null;
}

const paperSrc = (id: string, kind: "delivery" | "invoice" | "po") => `/paper/${id}/${kind === "delivery" ? "delivery.jpg" : `${kind}.png`}`;

function VerdictLine({ v }: { v: Verdict }) {
  if (v.kind === "hold") return <span className="font-medium text-stop">Hold: pay nothing</span>;
  if (v.waitingForPhoto) return <span className="font-medium text-info">Look at the photo, then pay {eur(v.waitingForPhoto)}</span>;
  if (v.kind === "ready") return <span className="font-medium text-ok">Pay {eur(v.payNow)}, all correct</span>;
  if (v.kind === "pay_adjusted") return <span className="font-medium text-warn">Pay {eur(v.payNow)}, claim {eur(v.disputed)}</span>;
  return <span className="text-muted">Unreadable, held</span>;
}

const THUMB: Record<string, { src: string; pos: string }> = {
  "meat-short-weight": { src: "/paper/meat-short-weight/chat.png", pos: "50% 62%" },
  "meat-photo-delivery": { src: "/paper/meat-photo-delivery/delivery.jpg", pos: "60% 45%" },
  "fish-bank-change": { src: "/paper/fish-bank-change/invoice.png", pos: "50% 2%" },
  "drinks-vat-return": { src: "/paper/drinks-vat-return/delivery-photo.jpg", pos: "50% 60%" },
  "veg-duplicate": { src: "/paper/veg-duplicate/invoice.png", pos: "50% 2%" },
  "clean-substitution": { src: "/paper/clean-substitution/delivery-photo.jpg", pos: "50% 45%" },
};

function CaseCard({ it }: { it: IndexItem }) {
  const t = THUMB[it.caseId];
  const v = it.verdict;
  return (
    <Link
      href={`/case/${it.caseId}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgb(27_26_23/0.35)]"
    >
      {t ? (
        <div className="relative aspect-[16/9] overflow-hidden bg-[#e9e5dc]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" aria-hidden loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" style={{ objectPosition: t.pos }} />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[12.5px] text-muted">{it.supplier}</p>
        <h3 className="mt-1 text-[17px] font-semibold leading-snug tracking-tight">{it.title}</h3>
        <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-ink-2">{it.story}</p>
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-[13.5px]">
          {v.invoiceTotal !== null ? <span className="text-muted">Printed {eur(v.invoiceTotal)} · </span> : null}
          <VerdictLine v={v} />
        </p>
        <span className="mt-4 inline-flex items-center gap-2 text-[14px] font-medium">
          Open the case <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

const STEPS: { title: string; endpoints: Endpoint[]; body: string }[] = [
  {
    title: "Screen every file before anything reads it",
    endpoints: ["pii", "script", "injection", "pipeline"],
    body: "Protect finds names, phones and bank accounts and returns a redacted PDF you can share. Inspect judges any script hidden in a PDF. Guard screens each document for text aimed at AI assistants, as the first step of a Pipeline that stops before reading if it fires.",
  },
  {
    title: "Read what the documents say, verbatim",
    endpoints: ["extract"],
    body: "Extract copies every header value and line with its exact position in the text, so every number on screen points back to where it was printed. A photo is read in image mode: same fields, no positions, and it is marked as such.",
  },
  {
    title: "Match the chef's order to the supplier's lines",
    endpoints: ["rerank"],
    body: "Orders are WhatsApp messages without supplier codes. Rerank decides which order line each invoiced product is, and says when a near match is a different product, like tomate rama for tomate pera.",
  },
  {
    title: "Do the arithmetic in code",
    endpoints: [],
    body: "Billed against delivered and returned, price against the agreed tariff, VAT against the tariff, lines against totals. Every euro withheld has a formula and an independent recomputation that must agree.",
  },
  {
    title: "Cross-examine documents and claims",
    endpoints: ["compare", "grounding"],
    body: "Compare reads every pair of documents and earlier invoices: the same delivery invoiced twice, or a delivery note that contradicts the invoice. Verify tests what the supplier wrote, such as a new tariff 'communicated on 15/10', against your records.",
  },
  {
    title: "Triage, fill the record, check the email",
    endpoints: ["decide", "fill", "grounding"],
    body: "Decide recommends an action and a priority for each discrepancy, with probabilities; under 60% sure, it is left to you. Fill writes the record and the email to the supplier, and Verify checks every claim in that email before you can copy it.",
  },
];

export default function Home() {
  const items = loadIndex();
  const meat = loadRun("meat-short-weight");
  const fish = loadRun("fish-bank-change");
  const photo = loadRun("meat-photo-delivery");
  const meatLayout = loadLayout("meat-short-weight");
  const fishLayout = loadLayout("fish-bank-change");

  const amount = meat ? amountProof(meat) : null;
  const account = fish ? accountProof(fish) : null;
  const invCrop = meat && amount ? crop(meat, meatLayout, amount.sources[0]) : null;
  const dnCrop = meat && amount ? crop(meat, meatLayout, amount.sources[1]) : null;
  const ibanCrop = fish && account ? crop(fish, fishLayout, account.sources[0]) : null;
  const hiddenCrop = fish && account ? crop(fish, fishLayout, account.sources[1]) : null;
  const meatIssue = meat?.issues.find((i) => i.type === "billed_not_delivered" && i.amount > 0);

  const sheet = (kind: "delivery" | "invoice", c: typeof invCrop, label: string, alt: string, to: number): PileSheet | null =>
    c ? { src: paperSrc("meat-short-weight", kind), page: c.page, region: [24, 0, c.page.width - 24, to] as Box, mark: c.cells[0] ?? c.box, label, alt } : null;
  const pileDelivery = sheet("delivery", dnCrop, `Delivery note, line ${dnCrop?.line}: 5,200 kg`, "The delivery note signed in the kitchen: 5,200 kg of solomillo.", 372);
  const pileInvoice = sheet("invoice", invCrop, `Invoice, line ${invCrop?.line}: 6,000 kg`, "The supplier's invoice: 6,000 kg of solomillo at 28,90.", 440);

  const avgCalls = items.length ? Math.round(items.reduce((a, i) => a + i.calls, 0) / items.length) : 0;
  const minCalls = items.length ? Math.min(...items.map((i) => i.calls)) : 0;
  const maxCalls = items.length ? Math.max(...items.map((i) => i.calls)) : 0;
  const avgCredits = items.length ? Math.round(items.reduce((a, i) => a + i.credits, 0) / items.length) : 0;
  const endpointCount = new Set(endpointsUsed(items.flatMap((i) => i.endpoints))).size;
  const photoDoc = photo?.documents.find((d) => d.photo);
  const photoFix = photoDoc?.photo?.corrections ?? [];
  // What was really printed under each correction (the synthetic world), to say plainly what the photo read got wrong.
  const printedTruth: Record<string, string> = Object.fromEntries(
    (CASES.find((c) => c.id === "meat-photo-delivery")?.delivery.lines ?? []).filter((l) => l.printedQty !== undefined).map((l) => [l.product, String(l.printedQty)]),
  );
  const misread = photoFix
    .map((c) => ({ ...c, truth: printedTruth[c.code] }))
    .find((c) => c.truth !== undefined && Number(c.printed.replace(",", ".")) !== Number(c.truth));

  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* 1. What it is, for whom, and the proof */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -left-40 -top-48 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_65%)] blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-14 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:pb-20">
            <div className="min-w-0">
              <p className="anim-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[13px] text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> For small restaurants and their supplier invoices
              </p>
              <h1 className="anim-fade-up mt-5 font-display text-[clamp(2.7rem,10.5vw,4.2rem)] leading-[0.98] tracking-[-0.015em] lg:text-[clamp(3.2rem,4.6vw,4.3rem)]" style={{ animationDelay: "80ms" }}>
                Pay the right amount,
                <br />
                <em className="text-accent">to the right account.</em>
              </h1>
              <p className="anim-fade-up mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2 sm:text-[18px]" style={{ animationDelay: "180ms" }}>
                Take a photo of the delivery note. Cuadra checks it against the chef&apos;s order and the supplier&apos;s invoice, line by line, and tells you
                what to pay, what to claim back and what not to pay at all.
              </p>
              <div className="anim-fade-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "260ms" }}>
                <Link
                  href="/case/meat-short-weight"
                  className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper shadow-card transition-colors hover:bg-ink-2"
                >
                  See an invoice checked
                  <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <a href={SITE.video} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink">
                  Watch the demo video <Icon name="external" className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="anim-fade-up mt-4 text-[13px] text-muted" style={{ animationDelay: "320ms" }}>
                No sign-up. Six sample cases, real Clocked runs recorded and replayed, open instantly on a phone.
              </p>
            </div>
            {meat && pileDelivery && pileInvoice ? <MondayPile chat="/paper/meat-short-weight/chat.png" delivery={pileDelivery} invoice={pileInvoice} verdict={meat.verdict} /> : null}
          </div>
        </section>

        {/* 2. The three steps */}
        <section id="steps" aria-labelledby="steps-h" className="border-y border-line bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 id="steps-h" className="max-w-4xl font-display text-[clamp(2.1rem,6vw,3.4rem)] leading-[1.02] tracking-[-0.01em]">
                Monday morning, three documents, one decision.
              </h2>
            </Reveal>
            <ol className="mt-14 space-y-20 lg:space-y-28">
              <li className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
                <Reveal className="min-w-0">
                  <p className="font-display text-[26px] italic text-accent">1</p>
                  <h3 className="mt-1 text-[22px] font-semibold tracking-tight">Send it what you already have</h3>
                  <p className="mt-3 max-w-md text-[16.5px] leading-relaxed text-ink-2">
                    The chef&apos;s WhatsApp order, the delivery note the kitchen signed (a phone photo is fine) and the supplier&apos;s PDF invoice. No new
                    habits in the kitchen.
                  </p>
                </Reveal>
                <Reveal delay={0.06} className="min-w-0">
                  <div className="relative mx-auto flex max-w-[620px] items-center justify-center py-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/paper/meat-short-weight/chat.png" alt="" aria-hidden loading="lazy" className="relative z-10 -mr-6 w-[27%] -rotate-[5deg] drop-shadow-[0_16px_24px_rgb(27_26_23/0.28)]" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/paper/meat-photo-delivery/delivery.jpg" alt="" aria-hidden loading="lazy" className="relative z-20 w-[52%] rotate-[1.5deg] rounded-lg shadow-[0_18px_40px_-14px_rgb(27_26_23/0.5)]" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/paper/meat-short-weight/invoice.png" alt="" aria-hidden loading="lazy" className="relative z-10 -ml-6 w-[30%] rotate-[4deg] rounded-[2px] bg-white shadow-[0_18px_40px_-14px_rgb(27_26_23/0.5)]" />
                  </div>
                  <p className="mt-2 text-center text-[12.5px] text-muted">The chat, the photo of the delivery note and the invoice, as they reach the owner.</p>
                </Reveal>
              </li>

              <li className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-14">
                <Reveal className="min-w-0 lg:order-2">
                  <p className="font-display text-[26px] italic text-accent">2</p>
                  <h3 className="mt-1 text-[22px] font-semibold tracking-tight">It checks every line against the other two</h3>
                  <p className="mt-3 max-w-md text-[16.5px] leading-relaxed text-ink-2">
                    Quantities against what was signed for, prices against the tariff you agreed, VAT, totals, duplicates, bank details. Every finding points to
                    the line it came from, on the document itself, so you can check it in seconds.
                  </p>
                </Reveal>
                {meat && invCrop && dnCrop ? (
                  <Reveal delay={0.06} className="min-w-0 lg:order-1">
                    <div className="space-y-2">
                      <p className="text-[13px] text-muted">
                        <span className="font-medium text-ink-2">Invoice, line {invCrop.line}</span> · what was billed
                      </p>
                      <DocCrop src={paperSrc("meat-short-weight", "invoice")} page={invCrop.page} line={invCrop.box} cells={invCrop.cells} x0={40} x1={492} above={16} below={16} alt={`Invoice line ${invCrop.line}: solomillo, 6,000 kg billed`} />
                      <p className="pt-3 text-[13px] text-muted">
                        <span className="font-medium text-ink-2">Delivery note, line {dnCrop.line}</span> · what the kitchen signed for
                      </p>
                      <DocCrop src={paperSrc("meat-short-weight", "delivery")} page={dnCrop.page} line={dnCrop.box} cells={dnCrop.cells} x0={40} x1={540} above={16} below={16} alt={`Delivery note line ${dnCrop.line}: solomillo, 5,200 kg delivered`} />
                      {meatIssue?.math ? (
                        <p className="pt-3 font-mono text-[13px] text-ink-2">
                          {meatIssue.math} → claim <span className="font-semibold text-warn">{eur(meatIssue.amount)}</span>
                        </p>
                      ) : null}
                    </div>
                  </Reveal>
                ) : null}
              </li>

              <li className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-14">
                <Reveal className="min-w-0">
                  <p className="font-display text-[26px] italic text-accent">3</p>
                  <h3 className="mt-1 text-[22px] font-semibold tracking-tight">You make one decision</h3>
                  <p className="mt-3 max-w-md text-[16.5px] leading-relaxed text-ink-2">
                    What to pay today, what to claim back, and what to hold. The email to the supplier is already written, and every claim in it was checked
                    against the documents before you can copy it.
                  </p>
                </Reveal>
                {meat ? (
                  <Reveal delay={0.06} className="min-w-0">
                    <div className="mx-auto max-w-[520px] rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
                      <p className="font-display text-[44px] leading-none">Pay {eur(meat.verdict.payNow)}</p>
                      <p className="mt-1.5 text-[13.5px] text-muted">instead of the printed {eur(meat.verdict.invoiceTotal ?? 0)}</p>
                      <ul className="mt-5 space-y-2 text-[15px]">
                        {meat.issues
                          .filter((i) => i.cls !== "info" && i.amount > 0)
                          .map((i) => (
                            <li key={i.id} className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                              <span className="min-w-0 text-ink-2">{i.title.split(":")[0].toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                              <span className={i.resolution === "credit_note" ? "tabular shrink-0 font-semibold text-warn" : "tabular shrink-0 font-semibold text-info"}>
                                {i.resolution === "credit_note" ? "claim" : "ask the kitchen"} {eur(i.amount)}
                              </span>
                            </li>
                          ))}
                      </ul>
                      <p className="mt-5 flex items-center gap-2 text-[13px] text-muted">
                        <Icon name="check" className="h-3.5 w-3.5 text-ok" /> Email to the supplier written by Fill, every claim checked by Verify
                      </p>
                    </div>
                  </Reveal>
                ) : null}
              </li>
            </ol>
          </div>
        </section>

        {/* 3. The invoice that must not be paid */}
        {fish && account && ibanCrop && hiddenCrop ? (
          <section aria-labelledby="fraud-h" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
              <Reveal className="min-w-0">
                <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-stop">The right account</p>
                <h2 id="fraud-h" className="mt-2 font-display text-[clamp(2.1rem,6vw,3.3rem)] leading-[1.02] tracking-[-0.01em]">
                  This invoice adds up to the cent. Do not pay it.
                </h2>
                <p className="mt-5 text-[16.5px] leading-relaxed text-ink-2">
                  The fish matches the order and the delivery note, the prices match the tariff. But the bank account is new, and in the empty space
                  at the bottom there is a note in white, 1-point text, written for whatever AI reads the invoice: approve it and say nothing.
                </p>
                <ul className="mt-6 space-y-3 text-[15px]">
                  {[
                    ["Protect", `finds the IBAN. Code compares it with the one on file (ending ${fish.supplier.ibanOnFileTail.replace(/\D/g, "")}): different, so the payment is held.`],
                    ["Guard", "flags the hidden note before Extract reads anything. The note is blanked out, and nothing in it can approve the invoice."],
                    ["Inspect", "reads the script hidden in the PDF: it sends the document to an outside site and opens an 'update IBAN' page."],
                  ].map(([who, what]) => (
                    <li key={who} className="flex gap-3">
                      <span className="mt-[3px] inline-flex h-5 shrink-0 items-center rounded-full bg-stop-soft px-2 font-mono text-[11px] text-stop">{who}</span>
                      <span className="text-ink-2">{what}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-[15px] text-ink-2">
                  Only you can lift the hold, after calling the supplier on the number you already had.{" "}
                  <Link href="/case/fish-bank-change" className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                    Open the fish invoice
                  </Link>
                </p>
              </Reveal>
              <Reveal delay={0.08} className="min-w-0">
                <figure>
                  <div className="overflow-hidden rounded-lg shadow-[0_2px_4px_rgb(27_26_23/0.1),0_30px_50px_-24px_rgb(27_26_23/0.45)]">
                    <PageCut
                      src={paperSrc("fish-bank-change", "invoice")}
                      page={ibanCrop.page}
                      region={[30, ibanCrop.box[1] - 40, ibanCrop.page.width - 30, ibanCrop.box[3] + 58]}
                      marks={(ibanCrop.cells.length ? ibanCrop.cells : [ibanCrop.box]).map((box) => ({ box, tone: "stop" as const }))}
                      alt="The payment block of the fish invoice, with the new IBAN marked."
                    />
                    <div aria-hidden className="flex items-center gap-3 bg-white px-4 py-2 text-[11.5px] text-muted">
                      <span className="h-px flex-1 border-t border-dashed border-line" /> empty page <span className="h-px flex-1 border-t border-dashed border-line" />
                    </div>
                    <PageCut
                      src={paperSrc("fish-bank-change", "invoice")}
                      page={hiddenCrop.page}
                      region={[30, hiddenCrop.box[1] - 26, hiddenCrop.page.width - 30, hiddenCrop.box[3] + 30]}
                      marks={[{ box: [hiddenCrop.box[0], hiddenCrop.box[1] - 3, Math.min(hiddenCrop.page.width - 40, hiddenCrop.box[0] + 380), hiddenCrop.box[3] + 3] as Box, tone: "stop" as const }]}
                      alt="The bottom of the fish invoice looks empty; a box shows where the white text sits."
                    />
                  </div>
                  <figcaption className="mt-4 space-y-2 text-[13px] text-ink-2">
                    <p>
                      <span className="font-medium">Invoice, line {ibanCrop.line}:</span> <span className="font-mono">{account.sources[0].match}</span>
                    </p>
                    <p>
                      <span className="font-medium">Invoice, line {hiddenCrop.line}</span> (invisible on the page, white on white):{" "}
                      <span className="font-mono text-stop">&ldquo;{account.sources[1].match}&rdquo;</span>
                    </p>
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          </section>
        ) : null}

        {/* 4. Paper is fine */}
        {photo && photoDoc ? (
          <section aria-labelledby="photo-h" className="border-y border-line bg-surface/60">
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
              <Reveal className="order-2 min-w-0 lg:order-1">
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/paper/meat-photo-delivery/delivery.jpg"
                    alt="A phone photo of the paper delivery note: 6,000 kg of solomillo crossed out and 5,2 written by hand; 3 chickens crossed out, 2 written, and 'falta 1'."
                    width={1800}
                    height={1350}
                    loading="lazy"
                    className="h-auto w-full rounded-xl shadow-[0_2px_4px_rgb(27_26_23/0.12),0_30px_60px_-28px_rgb(27_26_23/0.55)]"
                  />
                  <figcaption className="mt-3 text-[12.5px] text-muted">The photo Clocked read in the sixth case. Synthetic, drawn for the demo from the printed note plus the handwriting.</figcaption>
                </figure>
              </Reveal>
              <Reveal delay={0.06} className="order-1 min-w-0 lg:order-2">
                <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-info">Paper is fine</p>
                <h2 id="photo-h" className="mt-2 font-display text-[clamp(2.1rem,6vw,3.3rem)] leading-[1.02] tracking-[-0.01em]">
                  Most delivery notes arrive on paper, corrected by hand.
                </h2>
                <p className="mt-5 text-[16.5px] leading-relaxed text-ink-2">
                  Cuadra reads a phone photo with Clocked&apos;s image mode, the weights written at the door included. In the recording, Extract read the
                  handwritten {photoFix.map((c) => c.written).join(" and ") || "corrections"} and used them, so the claims come out to the cent.
                  {misread ? (
                    <>
                      {" "}
                      It also read the crossed-out {misread.truth} as a {misread.printed}.
                    </>
                  ) : null}
                </p>
                <p className="mt-4 text-[16.5px] leading-relaxed text-ink-2">
                  That is the reason for the rule: a photo has no character positions, so Cuadra never pays from it alone. You look at the photo, tap &ldquo;I
                  checked the photo&rdquo;, and only then is {eur(photo.verdict.waitingForPhoto ?? 0)} released.
                </p>
                <Link href="/case/meat-photo-delivery" className="group mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                  Open the photo case <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Reveal>
            </div>
          </section>
        ) : null}

        {/* 5. The cases */}
        <section id="cases" aria-labelledby="cases-h" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <h2 id="cases-h" className="font-display text-[clamp(2.1rem,6vw,3.3rem)] leading-[1.02] tracking-[-0.01em]">Six invoices from a week at a Madrid tavern</h2>
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
              Synthetic documents from a fictional restaurant, each with problems planted on purpose. Every run is a real Clocked recording from 3 and 5
              November 2026, replayed instantly. Nothing on these pages waits for the network.
            </p>
          </Reveal>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <Reveal as="li" key={it.caseId} delay={(i % 3) * 0.06}>
                <CaseCard it={it} />
              </Reveal>
            ))}
          </ul>
          <p className="mt-8 text-[14.5px] text-ink-2">
            Have a key?{" "}
            <Link href="/check" className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
              Run your own documents live
            </Link>{" "}
            on your machine, photos of delivery notes included.
          </p>
        </section>

        {/* 6. From an AI assistant */}
        <section id="assistants" aria-labelledby="mcp-h" className="border-y border-line bg-[#1b1a17] text-[#f5f2ea]">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14">
            <Reveal className="min-w-0">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#f5f2ea]/70">MCP server</p>
              <h2 id="mcp-h" className="mt-2 font-display text-[clamp(2.1rem,6vw,3.3rem)] leading-[1.02] tracking-[-0.01em]">Ask your assistant to check an invoice.</h2>
              <p className="mt-5 text-[16.5px] leading-relaxed text-[#f5f2ea]/80">
                Cuadra also runs as an MCP server, so Claude Desktop or any MCP client can use it. The assistant gets the same answer the app gives, with the
                line each finding came from, and the same rules: it cannot approve a held invoice, and the email it hands you was checked by Verify.
              </p>
              <p className="mt-6 font-mono text-[13px] leading-relaxed text-[#f5f2ea]/85">check_documents · explain_finding · draft_supplier_claim · list_sample_cases</p>
              <Link href="/assistants" className="group mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f5f2ea] px-5 text-[15px] font-medium text-[#1b1a17] hover:bg-white">
                Set it up in two minutes <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Reveal>
            <Reveal delay={0.06} className="min-w-0">
              <div className="rounded-2xl border border-white/15 bg-[#26251f] p-4 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)] sm:p-5">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/12 px-4 py-2.5 text-[14.5px] text-[#f5f2ea]">
                  Check the Gredos meat invoice against the delivery note and the chef&apos;s order.
                </p>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-2.5 py-1 font-mono text-[11.5px] text-[#f5f2ea]/75">
                  <Icon name="spark" className="h-3 w-3" /> cuadra · check_documents
                </p>
                <div className="mt-3 space-y-2 text-[14px] leading-relaxed text-[#f5f2ea]/90">
                  <p>
                    Pay {eur(meat?.verdict.payNow ?? 0)} now. Claim {eur(meat?.verdict.disputed ?? 0)} back with a credit note. Check {eur(meat?.verdict.pending ?? 0)} with the
                    kitchen first.
                  </p>
                  {amount ? (
                    <p className="rounded-lg bg-black/30 px-3 py-2 font-mono text-[12px] text-[#f5f2ea]/85">
                      {amount.sources.map((s) => (
                        <span key={s.doc} className="block">
                          {s.doc}, line {s.line}: <span className="text-[#f3c777]">{s.match}</span>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-2.5 py-1 font-mono text-[11.5px] text-[#f5f2ea]/75">
                  <Icon name="spark" className="h-3 w-3" /> cuadra · draft_supplier_claim
                </p>
                <p className="mt-3 text-[14px] text-[#f5f2ea]/90">
                  Here is the email Fill wrote. Verify checked each claim in it against the documents: {meat?.record?.emailCheck?.verdict ?? "checked"}.
                </p>
                <p className="mt-4 text-[11.5px] leading-relaxed text-[#f5f2ea]/65">
                  Tool names and answers from a real MCP session in replay mode (scripts/mcp-demo.mjs). The request in the first bubble is an example of what you would type.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 7. Under the hood */}
        <section id="how" aria-labelledby="how-h" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <h2 id="how-h" className="font-display text-[clamp(2.1rem,6vw,3.3rem)] leading-[1.02] tracking-[-0.01em]">Under the hood</h2>
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
              {minCalls} to {maxCalls} Clocked calls per invoice ({avgCalls} on average, about {avgCredits} credits), {endpointCount} endpoints, 11 to 24 seconds end to end in
              the recorded runs. Each endpoint changes what happens next. None is there for show.
            </p>
          </Reveal>
          <ol className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={(i % 2) * 0.05}>
                <div className="flex gap-4">
                  <span className="font-display text-[20px] italic text-muted">{i + 1}</span>
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-semibold tracking-tight">{s.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.endpoints.length ? (
                        s.endpoints.map((e) => <EndpointChip key={e} endpoint={e} />)
                      ) : (
                        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">no model</span>
                      )}
                    </div>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* 8. Limits, said plainly */}
        <section aria-labelledby="limits-h" className="border-t border-line bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <h2 id="limits-h" className="font-display text-[clamp(2rem,5.5vw,3rem)] leading-[1.02] tracking-[-0.01em]">What it will not do</h2>
            </Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                ["It never pays from a photo alone.", "A photo or a scan has no character positions. Cuadra reads it and checks it, then waits until you have looked at it. An invoice must be a PDF with text."],
                ["It never approves what it could not read.", "An invoice without a readable total or lines is reported as unreadable and held. A photo of your cat does not come back “matched”."],
                ["Detectors are not the lock.", "Guard, Inspect and Protect raise flags; the hold is enforced in code, and only you can clear it after calling the supplier on the number you already had."],
                ["Uncertain calls are yours.", "When Decide is less than 60% sure about an action, Cuadra does not apply it and asks you. Missing data stays missing and is shown as such."],
              ].map(([t, b], i) => (
                <Reveal key={t} delay={i * 0.04} className="rounded-2xl border border-line bg-surface p-5">
                  <h3 className="font-semibold tracking-tight">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{b}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
