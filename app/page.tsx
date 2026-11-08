import Link from "next/link";
import type { Endpoint } from "@/lib/clocked/client";
import type { Verdict } from "@/lib/engine/types";
import { CASES } from "@/data/world";
import { eur } from "@/lib/money";
import { loadIndex, loadLayout, loadRun, type IndexItem } from "@/lib/server/data";
import { SITE } from "@/lib/site";
import { endpointsUsed } from "@/lib/ui/endpoints";
import { heroCrops, landingCuts, locate as crop } from "@/lib/ui/landing";
import type { Box } from "@/lib/ui/paper";
import { accountProof, amountProof } from "@/lib/ui/proof";
import { SiteFooter, SiteHeader } from "./components/Chrome";
import { PrefetchLater } from "./components/landing/PrefetchLater";
import { StampOnView, Thread } from "./components/landing/Thread";
import { HeroTrail, type TrailSheet } from "./components/landing/Trail";
import { PageCut } from "./components/paper/DocCrop";
import { EndpointChip, Icon, Magnetic, Reveal, Stamp } from "./components/ui";

const paperSrc = (id: string, kind: "delivery" | "invoice" | "po") => `/paper/${id}/${kind === "delivery" ? "delivery.jpg" : `${kind}.png`}`;

function VerdictTag({ v }: { v: Verdict }) {
  const [tone, text] =
    v.kind === "hold"
      ? ["text-stop", "Hold: pay nothing"]
      : v.waitingForPhoto
        ? ["text-info", `Look at the photo, then pay ${eur(v.waitingForPhoto)}`]
        : v.kind === "ready"
          ? ["text-ok", `Pay ${eur(v.payNow)}, all correct`]
          : v.kind === "pay_adjusted"
            ? ["text-warn", `Pay ${eur(v.payNow)}, claim ${eur(v.disputed)}`]
            : ["text-muted", "Unreadable, held"];
  return (
    <span className={`inline-block border-[1.5px] border-current px-2 py-1 font-mono text-[11.5px] font-semibold leading-snug tracking-tight ${tone}`}>
      {text}
    </span>
  );
}

const THUMB: Record<string, { src: string; pos: string }> = {
  "meat-short-weight": { src: "/paper/meat-short-weight/chat.png", pos: "50% 62%" },
  "meat-photo-delivery": { src: "/paper/meat-photo-delivery/delivery.jpg", pos: "60% 45%" },
  "fish-bank-change": { src: "/paper/fish-bank-change/invoice.png", pos: "50% 2%" },
  "drinks-vat-return": { src: "/paper/drinks-vat-return/delivery-photo.jpg", pos: "50% 60%" },
  "veg-duplicate": { src: "/paper/veg-duplicate/invoice.png", pos: "50% 2%" },
  "clean-substitution": { src: "/paper/clean-substitution/delivery-photo.jpg", pos: "50% 45%" },
};

/** One case as one line of the week's ledger. */
function CaseRow({ it, n }: { it: IndexItem; n: number }) {
  const t = THUMB[it.caseId];
  const v = it.verdict;
  return (
    <Link
      href={`/case/${it.caseId}`}
      className="group relative grid grid-cols-[76px_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-line py-5 before:absolute before:inset-0 before:origin-left before:scale-x-0 before:bg-hl before:transition-transform before:duration-500 before:ease-[cubic-bezier(0.22,1,0.36,1)] hover:before:scale-x-100 focus-visible:before:scale-x-100 motion-reduce:before:transition-none sm:grid-cols-[120px_minmax(0,1fr)] lg:grid-cols-12 lg:gap-x-6 lg:py-6"
    >
      <span className="relative hidden pt-1 font-mono text-[12px] text-muted lg:col-span-1 lg:block">{String(n).padStart(2, "0")}</span>
      {t ? (
        <span className="relative row-span-2 block aspect-[4/3] overflow-hidden bg-surface shadow-card lg:col-span-2 lg:row-span-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" aria-hidden loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" style={{ objectPosition: t.pos }} />
        </span>
      ) : (
        <span className="row-span-2 lg:col-span-2 lg:row-span-1" />
      )}
      <span className="relative min-w-0 lg:col-span-3">
        <span className="block text-[13px] text-muted">{it.supplier}</span>
        <span className="mt-1 block text-[18px] font-semibold leading-tight tracking-[-0.01em] sm:text-[21px]">{it.title}</span>
      </span>
      <span className="relative hidden text-[14.5px] leading-relaxed text-ink-2 lg:col-span-3 lg:block">{it.story}</span>
      <span className="relative flex flex-col items-start gap-2 lg:col-span-3 lg:items-end lg:text-right">
        {v.invoiceTotal !== null ? <span className="tabular font-mono text-[11.5px] text-muted">printed {eur(v.invoiceTotal)}</span> : null}
        <VerdictTag v={v} />
        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
          Open <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </span>
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

const h2 = "font-display text-[clamp(2.1rem,5.2vw,4.4rem)] leading-[0.94]";

export default function Home() {
  const items = loadIndex();
  const meat = loadRun("meat-short-weight");
  const fish = loadRun("fish-bank-change");
  const photo = loadRun("meat-photo-delivery");
  const meatLayout = loadLayout("meat-short-weight");
  const fishLayout = loadLayout("fish-bank-change");

  const amount = meat ? amountProof(meat) : null;
  const account = fish ? accountProof(fish) : null;
  const cuts = meat && fish ? landingCuts(meat, meatLayout, fish, fishLayout) : null;
  const invCrop = meat && amount ? crop(meat, meatLayout, amount.sources[0]) : null;
  const dnCrop = meat && amount ? crop(meat, meatLayout, amount.sources[1]) : null;
  const ibanCrop = fish && account ? crop(fish, fishLayout, account.sources[0]) : null;
  const hiddenCrop = fish && account ? crop(fish, fishLayout, account.sources[1]) : null;
  const meatIssue = meat?.issues.find((i) => i.type === "billed_not_delivered" && i.amount > 0);

  const sheets: TrailSheet[] = (meat && heroCrops(meat, meatLayout)) || [];

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
      <PrefetchLater href="/case/meat-short-weight" />
      <main id="main">
        {/* 1. What it is, for whom, and the proof: three documents, one line, one stamp */}
        <section aria-labelledby="hero-h" className="desk-grid perf-bottom relative overflow-hidden text-on-desk">
          <div className="shell pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-14">
            <h1 id="hero-h" className="anim-fade-up font-display text-[clamp(2.45rem,7.15vw,6.6rem)] leading-[0.9] text-white">
              Pay the{" "}
              <span className="hl-text hl-swipe" style={{ animationDelay: "260ms" }}>
                right amount,
              </span>{" "}
              <br className="hidden lg:block" />
              to the right{" "}
              <span className="relative inline-block">
                account
                <span
                  aria-hidden
                  className="swipe absolute inset-x-0 -bottom-[0.1em] h-[0.15em] border-y-[0.035em] border-[#f0694b]"
                  style={{ animationDelay: "420ms" }}
                />
              </span>
              .
            </h1>
            <div className="mt-8 grid grid-cols-1 gap-12 lg:mt-12 lg:grid-cols-12 lg:gap-x-6">
              <div className="min-w-0 lg:col-span-4">
                <p className="anim-fade-up max-w-[34rem] text-[17px] leading-relaxed text-white/85 sm:text-[18px]" style={{ animationDelay: "90ms" }}>
                  Take a photo of the delivery note. Cuadra checks it against the chef&apos;s order and the supplier&apos;s invoice, line by line, and tells you
                  what to pay, what to claim back and what not to pay at all.
                </p>
                <div className="anim-fade-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-4" style={{ animationDelay: "160ms" }}>
                  <Magnetic>
                    <Link
                      href="/case/meat-short-weight"
                      prefetch={false}
                      className="group inline-flex min-h-[54px] items-center gap-4 bg-white pl-6 pr-5 text-[15.5px] font-semibold text-[#10153f] shadow-[0_18px_30px_-18px_rgb(0_0_0/0.6)] transition-colors hover:bg-[#ffe83d]"
                    >
                      See an invoice checked
                      <span aria-hidden className="h-7 border-l-[1.5px] border-dashed border-[#10153f]/35" />
                      <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </Magnetic>
                  <a
                    href={SITE.video}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-white underline decoration-white/50 decoration-[1.5px] underline-offset-[6px] hover:decoration-white"
                  >
                    Watch the demo video <Icon name="external" className="h-3.5 w-3.5" />
                  </a>
                </div>
                <p className="anim-fade-up mt-5 max-w-[30rem] text-[13px] leading-relaxed text-white/75" style={{ animationDelay: "220ms" }}>
                  No sign-up. Six sample cases, real Clocked runs recorded and replayed, open instantly on a phone.
                </p>
              </div>
              {meat && sheets.length ? (
                <div className="min-w-0 lg:col-span-8">
                  <HeroTrail
                    sheets={sheets}
                    stamp={`Pay ${eur(meat.verdict.payNow)}`}
                    stampSub={`claim ${eur(meat.verdict.disputed)} · ask ${eur(meat.verdict.pending)}`}
                    math={meatIssue?.math ? `${meatIssue.math} → claim ${eur(meatIssue.amount)}` : undefined}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* 2. The three steps */}
        <section id="steps" aria-labelledby="steps-h">
          <div className="shell grid grid-cols-1 gap-x-6 gap-y-12 py-20 sm:py-28 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <Reveal>
                  <h2 id="steps-h" className={h2}>
                    Monday morning, three documents, one decision.
                  </h2>
                </Reveal>
              </div>
            </div>
            <ol className="space-y-20 lg:col-span-7 lg:col-start-6 lg:space-y-28">
              <li className="dbl-top border-ink pt-5">
                <Reveal>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[13px] text-accent">01</span>
                    <h3 className="text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px]">Send it what you already have</h3>
                  </div>
                  <p className="mt-3 max-w-xl text-[16.5px] leading-relaxed text-ink-2 sm:pl-10">
                    The chef&apos;s WhatsApp order, the delivery note the kitchen signed (a phone photo is fine) and the supplier&apos;s PDF invoice. No new
                    habits in the kitchen.
                  </p>
                </Reveal>
                <Reveal delay={0.06}>
                  <div className="relative mt-8 flex items-end justify-center gap-0 sm:pl-10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/paper/landing/chat-sm.webp" width={420} height={742} alt="" aria-hidden loading="lazy" decoding="async" className="relative z-10 -mr-5 w-[26%] -rotate-[4deg] drop-shadow-[0_16px_20px_rgb(16_21_63/0.3)]" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/paper/landing/photo-delivery-sm.webp" width={760} height={570} alt="" aria-hidden loading="lazy" decoding="async" className="relative z-20 mb-6 w-[50%] rotate-[1.5deg] shadow-[0_18px_36px_-14px_rgb(16_21_63/0.55)]" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/paper/landing/invoice-sm.webp" width={480} height={679} alt="" aria-hidden loading="lazy" decoding="async" className="relative z-10 -ml-5 w-[30%] rotate-[3deg] bg-white shadow-[0_18px_36px_-14px_rgb(16_21_63/0.55)]" />
                  </div>
                  <p className="mt-4 font-mono text-[11px] text-muted sm:pl-10">The chat, the photo of the delivery note and the invoice, as they reach the owner.</p>
                </Reveal>
              </li>

              <li className="dbl-top border-ink pt-5">
                <Reveal>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[13px] text-accent">02</span>
                    <h3 className="text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px]">It checks every line against the other two</h3>
                  </div>
                  <p className="mt-3 max-w-xl text-[16.5px] leading-relaxed text-ink-2 sm:pl-10">
                    Quantities against what was signed for, prices against the tariff you agreed, VAT, totals, duplicates, bank details. Every finding points to
                    the line it came from, on the document itself, so you can check it in seconds.
                  </p>
                </Reveal>
                {meat && invCrop && dnCrop && cuts?.invLine && cuts.dnLine ? (
                  <Thread className="mt-8 space-y-2 sm:pl-10">
                    <p className="text-[13px] text-muted">
                      <span className="font-semibold text-ink">Invoice, line {invCrop.line}</span> · what was billed
                    </p>
                    <PageCut src={paperSrc("meat-short-weight", "invoice")} cut={cuts.invLine.src} page={invCrop.page} region={cuts.invLine.region} marks={invCrop.cells.map((box) => ({ box, tone: "marker" as const, node: "1" }))} className="shadow-card" alt={`Invoice line ${invCrop.line}: solomillo, 6,000 kg billed`} />
                    <p className="pt-6 text-[13px] text-muted">
                      <span className="font-semibold text-ink">Delivery note, line {dnCrop.line}</span> · what the kitchen signed for
                    </p>
                    <PageCut src={paperSrc("meat-short-weight", "delivery")} cut={cuts.dnLine.src} page={dnCrop.page} region={cuts.dnLine.region} marks={dnCrop.cells.map((box) => ({ box, tone: "marker" as const, node: "2" }))} className="shadow-card" alt={`Delivery note line ${dnCrop.line}: solomillo, 5,200 kg delivered`} />
                    {meatIssue?.math ? (
                      <p className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 pt-8 text-right font-mono text-[12.5px] text-ink-2 sm:text-[13px]">
                        <span>{meatIssue.math} →</span>
                        <span data-node="3" data-anchor="top" className="dbl inline-block font-semibold text-accent">
                          claim {eur(meatIssue.amount)}
                        </span>
                      </p>
                    ) : null}
                  </Thread>
                ) : null}
              </li>

              <li className="dbl-top border-ink pt-5">
                <Reveal>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[13px] text-accent">03</span>
                    <h3 className="text-[22px] font-semibold tracking-[-0.01em] sm:text-[26px]">You make one decision</h3>
                  </div>
                  <p className="mt-3 max-w-xl text-[16.5px] leading-relaxed text-ink-2 sm:pl-10">
                    What to pay today, what to claim back, and what to hold. The email to the supplier is already written, and every claim in it was checked
                    against the documents before you can copy it.
                  </p>
                </Reveal>
                {meat ? (
                  <Reveal delay={0.06} className="sm:pl-10">
                    <div className="relative mt-8 max-w-[560px]">
                    <div className="perf-top torn-bottom bg-surface px-6 pb-9 pt-7 shadow-card sm:px-8">
                      <p className="font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-none">Pay {eur(meat.verdict.payNow)}</p>
                      <p className="mt-2 text-[13.5px] text-muted">instead of the printed {eur(meat.verdict.invoiceTotal ?? 0)}</p>
                      <ul className="mt-6 font-mono text-[12.5px] sm:text-[13px]">
                        {meat.issues
                          .filter((i) => i.cls !== "info" && i.amount > 0)
                          .map((i) => (
                            <li key={i.id} className="flex items-baseline justify-between gap-3 border-t border-dashed border-line py-2">
                              <span className="min-w-0 text-ink-2">{i.title.split(":")[0].toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                              <span className={i.resolution === "credit_note" ? "tabular shrink-0 font-semibold text-warn" : "tabular shrink-0 font-semibold text-info"}>
                                {i.resolution === "credit_note" ? "claim" : "ask the kitchen"} {eur(i.amount)}
                              </span>
                            </li>
                          ))}
                      </ul>
                      <p className="dbl-top mt-1 flex items-center gap-2 border-ink pt-3 text-[13px] text-ink-2">
                        <Icon name="check" className="h-3.5 w-3.5 text-ok" /> Email to the supplier written by Fill, every claim checked by Verify
                      </p>
                    </div>
                      <span className="absolute -top-7 right-1 text-[clamp(1.2rem,2.6vw,1.8rem)] sm:-right-8">
                        <StampOnView>
                          <Stamp animate={false} rotate={8} sub={`${meat.totals.calls} Clocked calls`}>
                            Checked
                          </Stamp>
                        </StampOnView>
                      </span>
                    </div>
                  </Reveal>
                ) : null}
              </li>
            </ol>
          </div>
        </section>

        {/* 3. The invoice that must not be paid */}
        {fish && account && ibanCrop && hiddenCrop && cuts?.fishIban && cuts.fishHidden ? (
          <section aria-labelledby="fraud-h" className="bg-[#0b0f2e] text-white">
            <div className="shell grid grid-cols-1 gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-x-6">
              <Reveal className="min-w-0 lg:col-span-5">
                <h2 id="fraud-h" className={h2}>
                  This invoice adds up to the cent. <span className="text-[#ff7466]">Do not pay it.</span>
                </h2>
                <p className="mt-6 text-[16.5px] leading-relaxed text-white/80">
                  The fish matches the order and the delivery note, the prices match the tariff. But the bank account is new, and in the empty space at the
                  bottom there is a note in white, 1-point text, written for whatever AI reads the invoice: approve it and say nothing.
                </p>
                <ul className="mt-8 border-t border-white/20 text-[15px]">
                  {[
                    ["Protect", `finds the IBAN. Code compares it with the one on file (ending ${fish.supplier.ibanOnFileTail.replace(/\D/g, "")}): different, so the payment is held.`],
                    ["Guard", "flags the hidden note before Extract reads anything. The note is blanked out, and nothing in it can approve the invoice."],
                    ["Inspect", "reads the script hidden in the PDF: it sends the document to an outside site and opens an 'update IBAN' page."],
                  ].map(([who, what]) => (
                    <li key={who} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 border-b border-white/20 py-3">
                      <span className="pt-[3px] font-mono text-[11.5px] font-semibold text-[#ff7466]">{who}</span>
                      <span className="text-white/85">{what}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-[15px] text-white/80">
                  Only you can lift the hold, after calling the supplier on the number you already had.{" "}
                  <Link href="/case/fish-bank-change" className="font-semibold text-white underline decoration-white/50 decoration-[1.5px] underline-offset-[6px] hover:decoration-white">
                    Open the fish invoice
                  </Link>
                </p>
              </Reveal>
              <Reveal delay={0.08} className="min-w-0 lg:col-span-6 lg:col-start-7">
                <figure className="relative">
                  <div className="shadow-[0_40px_60px_-30px_rgb(0_0_0/0.9)]">
                    <PageCut
                      src={paperSrc("fish-bank-change", "invoice")}
                      cut={cuts.fishIban.src}
                      page={ibanCrop.page}
                      region={cuts.fishIban.region}
                      marks={(ibanCrop.cells.length ? ibanCrop.cells : [ibanCrop.box]).map((box) => ({ box, tone: "stop" as const }))}
                      alt="The payment block of the fish invoice, with the new IBAN marked."
                    />
                    <div aria-hidden className="flex items-center gap-3 bg-white px-4 py-2 font-mono text-[10.5px] text-[#545b8a]">
                      <span className="perf-line flex-1 text-[#c5cadc]" /> empty page <span className="perf-line flex-1 text-[#c5cadc]" />
                    </div>
                    <PageCut
                      src={paperSrc("fish-bank-change", "invoice")}
                      cut={cuts.fishHidden.src}
                      page={hiddenCrop.page}
                      region={cuts.fishHidden.region}
                      marks={[{ box: [hiddenCrop.box[0], hiddenCrop.box[1] - 3, Math.min(hiddenCrop.page.width - 40, hiddenCrop.box[0] + 380), hiddenCrop.box[3] + 3] as Box, tone: "stop" as const }]}
                      alt="The bottom of the fish invoice looks empty; a box shows where the white text sits."
                    />
                  </div>
                  <span className="absolute right-3 top-[36%] text-[clamp(1.4rem,3.6vw,2.6rem)] sm:right-8 sm:top-[40%]">
                    <StampOnView>
                      <Stamp animate={false} rotate={-6} tone="paper" sub="held in code">
                        Do not pay
                      </Stamp>
                    </StampOnView>
                  </span>
                  <figcaption className="mt-5 space-y-2 text-[13px] text-white/80">
                    <p>
                      <span className="font-semibold text-white">Invoice, line {ibanCrop.line}:</span> <span className="font-mono text-[12px]">{account.sources[0].match}</span>
                    </p>
                    <p>
                      <span className="font-semibold text-white">Invoice, line {hiddenCrop.line}</span> (invisible on the page, white on white):{" "}
                      <span className="font-mono text-[12px] text-[#ff9b90]">&ldquo;{account.sources[1].match}&rdquo;</span>
                    </p>
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          </section>
        ) : null}

        {/* 4. Paper is fine */}
        {photo && photoDoc ? (
          <section aria-labelledby="photo-h" className="overflow-hidden">
            <div className="shell grid grid-cols-1 gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-x-6">
              <Reveal className="order-2 min-w-0 lg:order-1 lg:col-span-7">
                <figure className="lg:-ml-[var(--gutter)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/paper/landing/photo-delivery.webp"
                    alt="A phone photo of the paper delivery note: 6,000 kg of solomillo crossed out and 5,2 written by hand; 3 chickens crossed out, 2 written, and 'falta 1'."
                    width={1400}
                    height={1050}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full shadow-[0_40px_60px_-34px_rgb(16_21_63/0.6)]"
                  />
                  <figcaption className="mt-3 font-mono text-[11px] leading-relaxed text-muted lg:pl-[var(--gutter)]">
                    The photo Clocked read in the sixth case. Synthetic, drawn for the demo from the printed note plus the handwriting.
                  </figcaption>
                </figure>
              </Reveal>
              <Reveal delay={0.06} className="order-1 min-w-0 lg:order-2 lg:col-span-4 lg:col-start-9">
                <h2 id="photo-h" className="font-display text-[clamp(2rem,3.9vw,3.4rem)] leading-[0.95]">
                  Most delivery notes arrive on paper, <span className="hl-text">corrected by hand.</span>
                </h2>
                <p className="mt-6 text-[16.5px] leading-relaxed text-ink-2">
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
                <Link href="/case/meat-photo-delivery" className="group mt-7 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink underline decoration-line decoration-[1.5px] underline-offset-[6px] hover:decoration-ink">
                  Open the photo case <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Reveal>
            </div>
          </section>
        ) : null}

        {/* 5. The cases, as the week's ledger */}
        <section id="cases" aria-labelledby="cases-h" className="scroll-mt-20 bg-surface">
          <div className="shell py-20 sm:py-28">
            <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-x-6">
              <h2 id="cases-h" className={`${h2} lg:col-span-7`}>
                Six invoices from a week at a Madrid tavern
              </h2>
              <p className="max-w-xl text-[16px] leading-relaxed text-ink-2 lg:col-span-4 lg:col-start-9">
                Synthetic documents from a fictional restaurant, each with problems planted on purpose. Every run is a real Clocked recording from 3 and 5
                November 2026, replayed instantly. Nothing on these pages waits for the network.
              </p>
            </Reveal>
            <ul className="dbl-top mt-12 border-ink">
              {items.map((it, i) => (
                <Reveal as="li" key={it.caseId} delay={Math.min(i, 5) * 0.04}>
                  <CaseRow it={it} n={i + 1} />
                </Reveal>
              ))}
            </ul>
            <p className="mt-8 text-[14.5px] text-ink-2">
              Have a key?{" "}
              <Link href="/check" className="font-semibold text-ink underline decoration-line decoration-[1.5px] underline-offset-[6px] hover:decoration-ink">
                Run your own documents live
              </Link>{" "}
              on your machine, photos of delivery notes included.
            </p>
          </div>
        </section>

        {/* 6. From an AI assistant: the session, printed on a till roll */}
        <section id="assistants" aria-labelledby="mcp-h" className="desk-grid text-on-desk">
          <div className="shell grid grid-cols-1 gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-x-6">
            <Reveal className="min-w-0 lg:col-span-5">
              <h2 id="mcp-h" className={h2}>
                Ask your assistant to check an invoice.
              </h2>
              <p className="mt-6 text-[16.5px] leading-relaxed text-white/85">
                Cuadra also runs as an MCP server, so Claude Desktop or any MCP client can use it. The assistant gets the same answer the app gives, with the
                line each finding came from, and the same rules: it cannot approve a held invoice, and the email it hands you was checked by Verify.
              </p>
              <p className="mt-6 font-mono text-[12px] leading-relaxed text-white">check_documents · explain_finding · draft_supplier_claim · list_sample_cases</p>
              <Magnetic className="mt-8">
                <Link href="/assistants" className="group inline-flex min-h-[52px] items-center gap-3 bg-white px-6 text-[15px] font-semibold text-[#10153f] hover:bg-[#ffe83d]">
                  Set it up in two minutes <Icon name="arrow" className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Magnetic>
            </Reveal>
            <Reveal delay={0.06} className="min-w-0 lg:col-span-5 lg:col-start-8">
              <div className="perf-top torn-bottom mx-auto max-w-[460px] -rotate-[1.2deg] bg-white px-6 pb-10 pt-8 font-mono text-[12.5px] leading-relaxed text-[#10153f] shadow-[0_40px_60px_-30px_rgb(0_0_0/0.7)]">
                <p className="text-center text-[11px] text-[#545b8a]">MCP session · replay mode</p>
                <p className="perf-line my-3 text-[#c5cadc]" aria-hidden />
                <p className="text-[#2b3270]">&gt; Check the Gredos meat invoice against the delivery note and the chef&apos;s order.</p>
                <p className="mt-4 font-semibold">[cuadra · check_documents]</p>
                <p className="mt-1">
                  Pay {eur(meat?.verdict.payNow ?? 0)} now. Claim {eur(meat?.verdict.disputed ?? 0)} back with a credit note. Check {eur(meat?.verdict.pending ?? 0)} with the kitchen
                  first.
                </p>
                {amount ? (
                  <p className="mt-2 border-l-2 border-[#ffe83d] pl-3 text-[11.5px] text-[#2b3270]">
                    {amount.sources.map((s) => (
                      <span key={s.doc} className="block">
                        {s.doc}, line {s.line}: <span className="bg-[#ffe83d] px-0.5 text-[#10153f]">{s.match}</span>
                      </span>
                    ))}
                  </p>
                ) : null}
                <p className="mt-4 font-semibold">[cuadra · draft_supplier_claim]</p>
                <p className="mt-1">Here is the email Fill wrote. Verify checked each claim in it against the documents: {meat?.record?.emailCheck?.verdict ?? "checked"}.</p>
                <p className="perf-line my-4 text-[#c5cadc]" aria-hidden />
                <p className="text-[10.5px] leading-relaxed text-[#545b8a]">
                  Tool names and answers from a real MCP session in replay mode (scripts/mcp-demo.mjs). The request in the first line is an example of what you would type.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 7. Under the hood */}
        <section id="how" aria-labelledby="how-h" className="scroll-mt-20">
          <div className="shell grid grid-cols-1 gap-x-6 gap-y-12 py-20 sm:py-28 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Reveal className="lg:sticky lg:top-28">
                <h2 id="how-h" className={h2}>
                  Under the hood
                </h2>
                <p className="mt-6 text-[16px] leading-relaxed text-ink-2">
                  {minCalls} to {maxCalls} Clocked calls per invoice ({avgCalls} on average, about {avgCredits} credits), {endpointCount} endpoints, 11 to 24 seconds end to
                  end in the recorded runs. Each endpoint changes what happens next. None is there for show.
                </p>
              </Reveal>
            </div>
            <ol className="dbl-top border-ink lg:col-span-7 lg:col-start-6">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={Math.min(i, 3) * 0.04}>
                  <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 border-b border-line py-6 sm:grid-cols-[56px_minmax(0,1fr)]">
                    <span className="font-mono text-[13px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <h3 className="text-[19px] font-semibold tracking-[-0.01em] sm:text-[21px]">{s.title}</h3>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {s.endpoints.length ? (
                          s.endpoints.map((e) => <EndpointChip key={e} endpoint={e} />)
                        ) : (
                          <span className="border border-line px-1.5 py-px font-mono text-[10.5px] leading-5 text-muted">no model</span>
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

        {/* 8. Limits, said plainly: the small print, printed large */}
        <section aria-labelledby="limits-h" className="bg-surface">
          <div className="shell grid grid-cols-1 gap-x-6 gap-y-10 py-20 sm:py-24 lg:grid-cols-12">
            <Reveal className="lg:col-span-4">
              <h2 id="limits-h" className={h2}>
                What it will not do
              </h2>
            </Reveal>
            <div className="grid gap-x-10 lg:col-span-8 lg:grid-cols-2">
              {[
                ["It never pays from a photo alone.", "A photo or a scan has no character positions. Cuadra reads it and checks it, then waits until you have looked at it. An invoice must be a PDF with text."],
                ["It never approves what it could not read.", "An invoice without a readable total or lines is reported as unreadable and held. A photo of your cat does not come back “matched”."],
                ["Detectors are not the lock.", "Guard, Inspect and Protect raise flags; the hold is enforced in code, and only you can clear it after calling the supplier on the number you already had."],
                ["Uncertain calls are yours.", "When Decide is less than 60% sure about an action, Cuadra does not apply it and asks you. Missing data stays missing and is shown as such."],
              ].map(([t, b], i) => (
                <Reveal key={t} delay={(i % 2) * 0.05} className="border-t border-ink py-5">
                  <h3 className="flex gap-3 text-[18px] font-semibold leading-snug tracking-[-0.01em]">
                    <span aria-hidden className="font-mono text-[15px] text-accent">×</span>
                    {t}
                  </h3>
                  <p className="mt-2 pl-7 text-[15px] leading-relaxed text-ink-2">{b}</p>
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
