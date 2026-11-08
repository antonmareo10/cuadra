import type { RunResult } from "../engine/types";
import { boxForSpan, type Box, type CaseLayout } from "./paper";
import { accountProof, amountProof, type ProofSource } from "./proof";

/** Where the checked line sits, from the top of every hero strip. */
export const LINE_AT = 0.28;
/** Hero strip aspect (width / height). */
export const STRIP_RATIO = 3 / 4;

/** A crop `width` page units wide whose line centre `lineY` lands at LINE_AT of the strip. */
export function stripRegion(x0: number, width: number, lineY: number): Box {
  const h = width / STRIP_RATIO;
  const y0 = lineY - LINE_AT * h;
  return [x0, y0, x0 + width, y0 + h];
}

/** One sheet of the hero row: cropped so the checked line sits at the same height on all three. */
export interface HeroSheet {
  key: "po" | "delivery" | "invoice";
  label: string;
  where: string;
  /** The pre-cut image the page shows, 600 px and 300 px wide (scripts/assets/landing.ts writes both). */
  src: string;
  srcSmall: string;
  /** The full page picture it is cut from. */
  full: string;
  page: { width: number; height: number };
  region: Box;
  /** Highlighted cells, in page units. */
  marks: Box[];
  alt: string;
  value: string;
  valueNote: string;
}

const midY = (b: Box) => (b[1] + b[3]) / 2;

/**
 * The hero row of the landing page, from the recorded meat case: the chef's order, line 12 of the
 * delivery note and line 13 of the invoice, where the solomillo was billed 6,000 kg and signed 5,200 kg.
 */
export function heroCrops(run: RunResult, layout: CaseLayout): HeroSheet[] | null {
  const amount = amountProof(run);
  if (!amount) return null;
  const at = (i: number) => {
    const s = amount.sources[i];
    const doc = run.documents.find((d) => d.kind === s.kind);
    const page = layout[s.kind];
    const found = doc && page ? boxForSpan(doc, page, s.start, s.end) : null;
    return found && page ? { ...found, page, match: s.match } : null;
  };
  const inv = at(0);
  const dn = at(1);
  if (!inv || !dn) return null;
  return [
    {
      key: "po",
      label: "Order",
      where: "WhatsApp, Tue 27 Oct",
      src: "/paper/landing/hero-po.webp",
      srcSmall: "/paper/landing/hero-po-300.webp",
      full: "/paper/meat-short-weight/chat.png",
      // The chat picture is 1075 × 1900 px; «6 kg de solomillo» sits at y ≈ 1028-1133 on it.
      page: { width: 1075, height: 1900 },
      region: stripRegion(200, 850, 1080),
      marks: [
        [843, 1028, 975, 1078],
        [252, 1083, 418, 1133],
      ],
      alt: "The chef's WhatsApp order: 6 kg of solomillo, 4 kg of secreto, 3 chickens, 5 kg of ribs and 2 boxes of burgers.",
      value: "6 kg",
      valueNote: "ordered",
    },
    {
      key: "delivery",
      label: "Delivery note",
      where: `line ${dn.line}, signed`,
      src: "/paper/landing/hero-delivery.webp",
      srcSmall: "/paper/landing/hero-delivery-300.webp",
      full: "/paper/meat-short-weight/delivery.jpg",
      page: { width: dn.page.width, height: dn.page.height },
      region: stripRegion(40, 465, midY(dn.box)),
      marks: dn.cells.length ? dn.cells : [dn.box],
      alt: `The delivery note signed in the kitchen, line ${dn.line}: ${dn.match} kg of solomillo.`,
      value: `${dn.match} kg`,
      valueNote: "signed for",
    },
    {
      key: "invoice",
      label: "Invoice",
      where: `line ${inv.line}`,
      src: "/paper/landing/hero-invoice.webp",
      srcSmall: "/paper/landing/hero-invoice-300.webp",
      full: "/paper/meat-short-weight/invoice.png",
      page: { width: inv.page.width, height: inv.page.height },
      region: stripRegion(40, 465, midY(inv.box)),
      marks: inv.cells.length ? inv.cells : [inv.box],
      alt: `The supplier's invoice, line ${inv.line}: ${inv.match} kg of solomillo.`,
      value: `${inv.match} kg`,
      valueNote: "invoiced",
    },
  ];
}

/** Where a quoted source sits on its page picture: the line, its box and the cells of the quote. */
export function locate(run: RunResult, layout: CaseLayout, s: ProofSource | undefined) {
  if (!s) return null;
  const doc = run.documents.find((d) => d.kind === s.kind);
  const page = layout[s.kind];
  if (!doc || !page) return null;
  const at = boxForSpan(doc, page, s.start, s.end);
  return at ? { ...at, page } : null;
}

/** A region of a page picture, pre-cut for the landing page (scripts/assets/landing.ts writes `src`). */
export interface LandingCut {
  src: string;
  full: string;
  page: { width: number; height: number };
  region: Box;
  /** Pixel width of the pre-cut image. */
  width: number;
}

/**
 * The page regions the landing shows further down: the two disagreeing lines of the meat case (step 2)
 * and the payment block and hidden note of the fish invoice. The page and the asset script both read
 * the regions from here, so the pre-cut images always match what the page expects.
 */
export function landingCuts(meat: RunResult, meatLayout: CaseLayout, fish: RunResult, fishLayout: CaseLayout) {
  const amount = amountProof(meat);
  const account = accountProof(fish);
  const inv = amount ? locate(meat, meatLayout, amount.sources[0]) : null;
  const dn = amount ? locate(meat, meatLayout, amount.sources[1]) : null;
  const iban = account ? locate(fish, fishLayout, account.sources[0]) : null;
  const hidden = account ? locate(fish, fishLayout, account.sources[1]) : null;
  const cut = (name: string, full: string, page: { width: number; height: number }, region: Box, width: number): LandingCut => ({
    src: `/paper/landing/${name}.webp`,
    full,
    page: { width: page.width, height: page.height },
    region,
    width,
  });
  return {
    invLine: inv
      ? cut("line-invoice", "/paper/meat-short-weight/invoice.png", inv.page, [40, Math.max(0, inv.box[1] - 16), 492, Math.min(inv.page.height, inv.box[3] + 16)], 1100)
      : null,
    dnLine: dn
      ? cut("line-delivery", "/paper/meat-short-weight/delivery.jpg", dn.page, [40, Math.max(0, dn.box[1] - 16), 540, Math.min(dn.page.height, dn.box[3] + 16)], 1100)
      : null,
    fishIban: iban ? cut("fish-iban", "/paper/fish-bank-change/invoice.png", iban.page, [30, iban.box[1] - 40, iban.page.width - 30, iban.box[3] + 58], 1100) : null,
    fishHidden: hidden
      ? cut("fish-hidden", "/paper/fish-bank-change/invoice.png", hidden.page, [30, hidden.box[1] - 26, hidden.page.width - 30, hidden.box[3] + 30], 1100)
      : null,
  };
}
