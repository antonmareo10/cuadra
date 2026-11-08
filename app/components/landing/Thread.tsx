"use client";

import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The red thread a bookkeeper draws from one document to the next: it runs through every element
 * marked data-node="1", "2", ... inside, and is drawn as the reader scrolls past (from the block's top
 * at 85% of the screen to its bottom at 60%). Reduced motion: drawn at once. Purely decorative
 * (aria-hidden); the content around it says the same in words. No animation library: one scroll
 * listener, one stroke-dashoffset.
 */
export function Thread({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const [geo, setGeo] = useState<{ d: string; pts: [number, number][] } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-node]")).sort((a, b) => Number(a.dataset.node) - Number(b.dataset.node));
      const pts = nodes.map((n) => {
        const r = n.getBoundingClientRect();
        // A node on running text is reached from above, so the thread never crosses the words.
        const y = n.dataset.anchor === "top" ? r.top - box.top - 6 : r.top - box.top + r.height / 2;
        return [r.left - box.left + r.width / 2, y] as [number, number];
      });
      if (pts.length < 2) return setGeo(null);
      let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const my = (y0 + y1) / 2;
        d += ` C ${x0.toFixed(1)} ${my.toFixed(1)}, ${x1.toFixed(1)} ${my.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      }
      setGeo({ d, pts });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const imgs = Array.from(el.querySelectorAll("img"));
    imgs.forEach((img) => img.addEventListener("load", measure));
    return () => {
      ro.disconnect();
      imgs.forEach((img) => img.removeEventListener("load", measure));
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    const p = path.current;
    if (!el || !p) return;
    if (reducedMotion()) {
      p.style.strokeDashoffset = "0";
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const t = Math.min(1, Math.max(0, (0.85 * vh - r.top) / (0.25 * vh + r.height)));
      p.style.strokeDashoffset = String(1 - t);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [geo]);

  return (
    <div ref={ref} className={clsx("relative", className)}>
      {children}
      {geo ? (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path ref={path} d={geo.d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} fill="none" stroke="var(--accent)" strokeWidth={1.75} strokeLinecap="round" />
          {geo.pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4} fill="var(--accent)" />
          ))}
        </svg>
      ) : null}
    </div>
  );
}

/**
 * A stamp that lands when it scrolls into view. The server HTML shows it in place (no JavaScript,
 * reduced motion, or already on screen); only a stamp below the fold waits for the reader.
 */
export function StampOnView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"still" | "wait" | "land">("still");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || el.getBoundingClientRect().top < window.innerHeight) return;
    setState("wait");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("land");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <span ref={ref} className={clsx("inline-block", state === "wait" && "stamp-wait", state === "land" && "stamp-land", className)}>
      {children}
    </span>
  );
}
