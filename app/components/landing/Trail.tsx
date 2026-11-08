import clsx from "clsx";
import { LINE_AT, STRIP_RATIO, type HeroSheet } from "@/lib/ui/landing";

export type TrailSheet = HeroSheet;

function Strip({ sheet, delay, from }: { sheet: TrailSheet; delay: number; from: number }) {
  const [x0, y0, x1, y1] = sheet.region;
  const cw = x1 - x0;
  const ch = y1 - y0;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div
      role="img"
      aria-label={sheet.alt}
      className="strip-in relative z-[1] overflow-hidden bg-white shadow-[0_1px_0_rgb(0_0_0/0.15),0_30px_40px_-26px_rgb(4_8_40/0.75)]"
      style={{ aspectRatio: `${STRIP_RATIO}`, animationDelay: `${delay}ms`, ["--from" as string]: `${from}px` }}
    >
      {/* The strip is pre-cut to exactly `region` (scripts/assets/landing.ts), so it simply fills the sheet. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sheet.src}
        srcSet={`${sheet.srcSmall} 300w, ${sheet.src} 600w`}
        sizes="(min-width: 1024px) 21vw, 31vw"
        alt=""
        aria-hidden
        width={600}
        height={800} draggable={false} decoding="async" className="absolute inset-0 h-full w-full select-none" />
      {sheet.marks.map((m, i) => {
        const h = Math.max(m[3] - m[1], 9);
        const cy = (m[1] + m[3]) / 2;
        return (
          <span
            key={i}
            aria-hidden
            className="marker swipe absolute"
            style={{
              left: pct(m[0] - x0 - 3, cw),
              top: pct(cy - h / 2 - 2 - y0, ch),
              width: pct(m[2] - m[0] + 6, cw),
              height: pct(h + 4, ch),
              animationDelay: `${560 + delay + i * 60}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The hero: the chef's order, the signed delivery note and the invoice laid side by side on the desk,
 * cropped so the same line sits at the same height on all three. A red rule runs across that line;
 * the numbers that disagree get the highlighter; the stamp says what to pay.
 */
export function HeroTrail({ sheets, stamp, stampSub, math, className }: { sheets: TrailSheet[]; stamp: string; stampSub: string; math?: string; className?: string }) {
  return (
    <figure className={clsx("relative", className)} aria-labelledby="trail-caption">
      <ol className="grid grid-cols-3 gap-2 font-mono text-[10px] leading-tight text-white/85 sm:gap-4 sm:text-[11px]">
        {sheets.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <span className="text-white">{String(i + 1).padStart(2, "0")}</span> <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden">{s.label.split(" ")[0]}</span>
            <span className="mt-0.5 block truncate text-white/70">{s.where}</span>
          </li>
        ))}
      </ol>
      <div className="relative mt-3 grid grid-cols-3 gap-2 sm:gap-4">
        {sheets.map((s, i) => (
          <Strip key={s.key} sheet={s} delay={90 + i * 80} from={[28, -22, 40][i] ?? 24} />
        ))}
        {/* The line where the three must agree: a red thread passing behind the sheets, seen in the gaps. */}
        <span aria-hidden className="swipe pointer-events-none absolute -inset-x-3 z-0 h-[2px] -translate-y-1/2 bg-[#ff5545] sm:-inset-x-6" style={{ top: `${LINE_AT * 100}%`, animationDelay: "430ms" }} />
        <span className="pointer-events-none absolute bottom-[9%] right-[1%] z-[2] text-[clamp(1.35rem,4.6vw,3.6rem)] sm:bottom-[12%] sm:right-[3%]">
          <span className="sr-only">Cuadra says: </span>
          <StampFace text={stamp} sub={stampSub} />
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-4">
        {sheets.map((s) => (
          <div key={s.key} className="min-w-0">
            <dt className="sr-only">{s.label}</dt>
            <dd className="tabular font-mono text-[15px] font-semibold leading-none tracking-tight text-white sm:text-[24px]">{s.value}</dd>
            <dd className="mt-1 text-[11px] text-white/75 sm:text-[13px]">{s.valueNote}</dd>
          </div>
        ))}
      </dl>
      <figcaption id="trail-caption" className="mt-4 flex flex-col gap-1 border-t border-white/20 pt-3 text-[12px] leading-snug text-white/75 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        {math ? <span className="font-mono text-[11px] text-white">{math}</span> : null}
        <span>The meat case from the demo. Synthetic documents; a real Clocked run, recorded and replayed.</span>
      </figcaption>
    </figure>
  );
}

/** The stamp's face (server-rendered, lands with CSS). */
export function StampFace({ text, sub, delay = 760, rotate = -8, className }: { text: string; sub?: string; delay?: number; rotate?: number; className?: string }) {
  return (
    <span
      className={clsx("stamp stamp-in text-[#cf2416]", className)}
      style={{ ["--r" as string]: `${rotate}deg`, animationDelay: `${delay}ms` }}
    >
      <span>{text}</span>
      {sub ? <span className="stamp-sub">{sub}</span> : null}
    </span>
  );
}
