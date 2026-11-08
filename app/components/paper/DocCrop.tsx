import clsx from "clsx";
import type { ReactNode } from "react";
import type { Box, PageLayout } from "@/lib/ui/paper";

export interface CutMark {
  box: Box;
  tone: "warn" | "stop" | "accent" | "marker";
  /** Marks a point the scroll thread on the landing page runs through (see landing/Thread.tsx). */
  node?: string;
}

const TONE = {
  warn: "bg-warn/20 ring-warn",
  stop: "bg-stop/15 ring-stop",
  accent: "bg-hl/60 ring-accent",
  marker: "marker ring-0",
};

/**
 * A region of a page picture, with the cells a finding points to marked on the picture itself.
 * Pure CSS (server-rendered), so it reads the same without JavaScript.
 */
export function PageCut({
  src,
  page,
  region,
  marks = [],
  className,
  alt,
  children,
  eager = false,
  cut,
}: {
  src: string;
  page: Pick<PageLayout, "width" | "height">;
  region: Box;
  marks?: CutMark[];
  className?: string;
  alt: string;
  children?: ReactNode;
  eager?: boolean;
  /** A picture pre-cut to exactly `region` (lighter than the whole page); it then simply fills the box. */
  cut?: string;
}) {
  const [x0, y0, x1, y1] = region;
  const cw = x1 - x0;
  const ch = y1 - y0;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div role="img" aria-label={alt} className={clsx("relative overflow-hidden bg-white", className)} style={{ aspectRatio: `${cw} / ${ch}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cut ?? src}
        alt=""
        aria-hidden
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className={cut ? "absolute inset-0 h-full w-full select-none" : "absolute max-w-none select-none"}
        style={cut ? undefined : { width: pct(page.width, cw), left: pct(-x0, cw), top: pct(-y0, ch) }}
      />
      {marks.map((m, i) => {
        const h = Math.max(m.box[3] - m.box[1], 9);
        const cy = (m.box[1] + m.box[3]) / 2;
        return (
          <span
            key={i}
            aria-hidden
            data-node={m.node}
            className={clsx("absolute rounded-[2px]", m.tone !== "marker" && "ring-2", TONE[m.tone])}
            style={{ left: pct(m.box[0] - x0 - 3, cw), top: pct(cy - h / 2 - 2.5 - y0, ch), width: pct(m.box[2] - m.box[0] + 6, cw), height: pct(h + 5, ch) }}
          />
        );
      })}
      {children}
    </div>
  );
}

/** A strip of a page around one printed line. */
export function DocCrop({
  src,
  page,
  line,
  cells,
  tone = "warn",
  nodes = [],
  above = 14,
  below = 14,
  x0 = 40,
  x1,
  className,
  alt,
}: {
  src: string;
  page: Pick<PageLayout, "width" | "height">;
  line: Box;
  cells: Box[];
  tone?: "warn" | "stop" | "marker";
  nodes?: string[];
  above?: number;
  below?: number;
  x0?: number;
  x1?: number;
  className?: string;
  alt: string;
}) {
  return (
    <PageCut
      src={src}
      page={page}
      region={[x0, Math.max(0, line[1] - above), x1 ?? page.width - 40, Math.min(page.height, line[3] + below)]}
      marks={cells.map((box, i) => ({ box, tone, node: nodes[i] }))}
      className={clsx("shadow-card", className)}
      alt={alt}
    />
  );
}
