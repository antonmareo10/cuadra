import type { Verdict } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import type { Box, PageLayout } from "@/lib/ui/paper";
import { PageCut } from "../paper/DocCrop";

export interface PileSheet {
  src: string;
  page: Pick<PageLayout, "width" | "height">;
  region: Box;
  mark: Box | null;
  label: string;
  alt: string;
}

/**
 * The hero picture: Monday morning's three documents in a pile (the chef's chat, the signed
 * delivery note, the invoice), the two lines that disagree marked on the paper, and the one
 * decision Cuadra gives. Everything comes from the recorded meat case at build time.
 */
export function MondayPile({ chat, delivery, invoice, verdict }: { chat: string; delivery: PileSheet; invoice: PileSheet; verdict: Verdict }) {
  return (
    <figure className="relative mx-auto w-full max-w-[640px]" aria-labelledby="pile-caption">
      <div className="relative aspect-[10/9] w-full">
        {/* The chef's order, on his phone */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chat}
          alt="The chef's WhatsApp order on his phone: 6 kg of solomillo, 4 kg of secreto, 3 chickens, 5 kg of ribs and 2 boxes of burgers."
          width={1075}
          height={1900}
          className="pile-in absolute left-[1%] top-[3%] w-[31%] -rotate-[7deg] drop-shadow-[0_18px_28px_rgb(27_26_23/0.28)]"
          style={{ animationDelay: "120ms" }}
        />
        {/* The delivery note the kitchen signed */}
        <div className="pile-in absolute left-[20%] top-[8%] w-[60%] -rotate-[2.5deg]" style={{ animationDelay: "240ms" }}>
          <PageCut
            src={delivery.src}
            page={delivery.page}
            region={delivery.region}
            marks={delivery.mark ? [{ box: delivery.mark, tone: "warn" }] : []}
            className="rounded-[3px] shadow-[0_2px_4px_rgb(27_26_23/0.12),0_26px_44px_-18px_rgb(27_26_23/0.45)]"
            alt={delivery.alt}
            eager
          />
          <span className="pile-label absolute -top-7 right-2 hidden sm:block">{delivery.label} ↘</span>
        </div>
        {/* The supplier's invoice */}
        <div className="pile-in absolute right-[0%] top-[34%] w-[56%] rotate-[3deg]" style={{ animationDelay: "380ms" }}>
          <PageCut
            src={invoice.src}
            page={invoice.page}
            region={invoice.region}
            marks={invoice.mark ? [{ box: invoice.mark, tone: "warn" }] : []}
            className="rounded-[3px] shadow-[0_2px_4px_rgb(27_26_23/0.12),0_30px_50px_-20px_rgb(27_26_23/0.5)]"
            alt={invoice.alt}
            eager
          />
          <span className="pile-label absolute -bottom-3 right-3 hidden translate-y-full sm:block">↖ {invoice.label}</span>
        </div>
        {/* The decision */}
        <div
          className="pile-in absolute bottom-[2%] left-[3%] w-[52%] min-w-[220px] rounded-2xl border border-line bg-surface/95 p-4 shadow-[0_24px_50px_-20px_rgb(27_26_23/0.45)] backdrop-blur sm:p-5"
          style={{ animationDelay: "560ms" }}
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Cuadra says</p>
          <p className="mt-1 font-display text-[clamp(1.6rem,4.4vw,2.4rem)] leading-[1.02] tracking-[-0.01em]">Pay {eur(verdict.payNow)} now</p>
          <dl className="mt-3 space-y-1 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Claim back</dt>
              <dd className="tabular font-semibold text-warn">{eur(verdict.disputed)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Ask the kitchen</dt>
              <dd className="tabular font-semibold text-info">{eur(verdict.pending)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <figcaption id="pile-caption" className="mt-3 text-center text-[12.5px] text-muted sm:text-right">
        The meat case from the demo. Synthetic documents; a real Clocked run, recorded and replayed.
      </figcaption>
    </figure>
  );
}
