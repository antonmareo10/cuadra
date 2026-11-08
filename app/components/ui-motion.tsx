"use client";

import clsx from "clsx";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { eur } from "@/lib/money";
import { EASE } from "./ui";

// Counters and meters for the case pages. Kept apart from ./ui so the landing page does not load motion.

export type CountFormat = "eur" | "int" | "approx";

const FORMATS: Record<CountFormat, (n: number) => string> = {
  eur: (n) => eur(n),
  int: (n) => String(Math.round(n)),
  approx: (n) => `≈${Math.round(n)}`,
};

// False until the first page load has hydrated; later mounts come from client-side navigation.
let pageHydrated = false;

/**
 * Shows the real value in the server HTML (so the page reads right without JavaScript and hydrates
 * without a mismatch). It counts up from zero only where that cannot flash: numbers below the fold on
 * the first load, and every number after a client-side navigation (reset before paint). A changed
 * value counts from the old one. Reduced motion never animates.
 */
export function CountUp({ value, format: kind, className }: { value: number; format: CountFormat; className?: string }) {
  const format = FORMATS[kind];
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const last = useRef(value);
  useLayoutEffect(() => {
    const el = ref.current;
    const visibleNow = el ? el.getBoundingClientRect().top < window.innerHeight && el.getBoundingClientRect().bottom > 0 : false;
    const firstLoad = !pageHydrated;
    if (!reduce && (!firstLoad || !visibleNow)) {
      last.current = 0;
      setShown(0);
    }
    // Flip after the whole hydration commit, so every number visible on the first load keeps its value.
    if (firstLoad) setTimeout(() => (pageHydrated = true), 0);
    // Runs once on mount by design: it only decides where the first count starts.
  }, []);
  useEffect(() => {
    if (reduce) {
      last.current = value;
      setShown(value);
      return;
    }
    if (!inView || last.current === value) return;
    const controls = animate(last.current, value, {
      duration: 0.9,
      ease: EASE,
      onUpdate: (v) => {
        last.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className={clsx("tabular", className)}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}

export function ProbabilityBar({ value, tone = "ink", label }: { value: number; tone?: "ink" | "ok" | "warn" | "stop" | "info"; label?: string }) {
  const color = { ink: "bg-ink", ok: "bg-ok", warn: "bg-warn", stop: "bg-stop", info: "bg-info" }[tone];
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label ?? "probability"}>
        <motion.span
          className={clsx("absolute inset-y-0 left-0 rounded-full", color)}
          initial={{ width: 0 }}
          whileInView={{ width: `${Math.max(2, value * 100)}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </span>
      <span className="tabular font-mono text-[11px] text-muted">{Math.round(value * 100)}%</span>
    </span>
  );
}
