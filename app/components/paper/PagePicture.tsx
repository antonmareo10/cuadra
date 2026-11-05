"use client";

import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { boxStyle, type Box, type PageLayout, type Picture } from "@/lib/ui/paper";

export interface PictureMark {
  box: Box;
  tone: "warn" | "stop" | "info";
  title: string;
}

const TONE: Record<PictureMark["tone"], string> = {
  warn: "bg-warn/15 ring-warn/70",
  stop: "bg-stop/15 ring-stop/70",
  info: "bg-info/12 ring-info/60",
};

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A document as it arrived: the picture of the page, the chat or the photo. Lines behind a
 * finding are outlined on the page itself; a focused line is zoomed to and ringed. Click or
 * press the zoom button to look closer; it never replaces the text view next to it.
 */
export function PagePicture({
  picture,
  page,
  marks = [],
  focus,
  height = 560,
  priority = false,
}: {
  picture: Picture;
  page?: PageLayout;
  marks?: PictureMark[];
  focus?: { box: Box; cells: Box[]; nonce: number } | null;
  height?: number;
  priority?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [view, setView] = useState<{ z: number; x: number; y: number }>({ z: 1, x: 0, y: 0 });
  const ratio = picture.height / picture.width;
  const imgH = w * ratio;
  const vh = Math.min(height, imgH || height);
  const pt = page ? w / page.width : 0;

  useIso(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const clamp = (z: number, x: number, y: number) => ({
    z,
    x: Math.min(0, Math.max(w - w * z, x)),
    y: Math.min(0, Math.max(vh - imgH * z, y)),
  });

  const zoomTo = (cx: number, cy: number, z: number) => setView(clamp(z, w / 2 - cx * z, vh / 2 - cy * z));

  useEffect(() => {
    if (!focus || !page || !w) return;
    const b = focus.cells[0] ?? focus.box;
    const z = w < 520 ? 2.3 : 1.7;
    zoomTo(((b[0] + b[2]) / 2) * pt, ((b[1] + b[3]) / 2) * pt, z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, w]);

  const zoomed = view.z > 1.01;
  const onClick = (e: React.MouseEvent) => {
    if (zoomed) return setView({ z: 1, x: 0, y: 0 });
    const r = box.current!.getBoundingClientRect();
    zoomTo(e.clientX - r.left - view.x, e.clientY - r.top - view.y, 2);
  };

  return (
    <div className="relative">
      <div
        ref={box}
        onClick={onClick}
        style={{ height: w ? vh : undefined, aspectRatio: w ? undefined : `${picture.width} / ${Math.min(picture.height, (picture.width * height) / 600)}` }}
        className={clsx(
          "relative overflow-hidden rounded-xl bg-[#e9e5dc] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]",
          zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
        )}
      >
        <div
          className="absolute left-0 top-0 w-full origin-top-left transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={picture.src}
            alt={picture.alt}
            width={picture.width}
            height={picture.height}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            className="block h-auto w-full select-none"
          />
          {page
            ? marks.map((m, i) => (
                <span key={i} aria-hidden title={m.title} className={clsx("pointer-events-none absolute rounded-[3px] ring-1", TONE[m.tone])} style={boxStyle(m.box, page, 2)} />
              ))
            : null}
          {page && focus
            ? (focus.cells.length ? focus.cells : [focus.box]).map((b, i) => (
                <span
                  key={`${focus.nonce}-${i}`}
                  aria-hidden
                  className="focus-ring pointer-events-none absolute rounded-[3px] bg-hl/60 ring-2 ring-accent"
                  style={boxStyle(b, page, 1.6)}
                />
              ))
            : null}
        </div>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 flex gap-1">
        <button
          type="button"
          onClick={() => (zoomed ? setView({ z: 1, x: 0, y: 0 }) : zoomTo(w / 2, vh / 3, 2))}
          className="pointer-events-auto inline-flex min-h-9 items-center rounded-full bg-surface/90 px-3 text-[12.5px] text-ink-2 shadow-card backdrop-blur hover:text-ink"
        >
          {zoomed ? "Whole width" : "Zoom in"}
        </button>
        <a
          href={picture.src}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto inline-flex min-h-9 items-center rounded-full bg-surface/90 px-3 text-[12.5px] text-ink-2 shadow-card backdrop-blur hover:text-ink"
        >
          Full size
        </a>
      </div>
    </div>
  );
}
