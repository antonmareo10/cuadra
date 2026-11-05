"use client";

import clsx from "clsx";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Endpoint } from "@/lib/clocked/client";
import { eur } from "@/lib/money";
import { WORDMARK } from "@/lib/ui/brand";

export const EASE = [0.22, 1, 0.36, 1] as const;

export const ENDPOINT_NAME: Record<Endpoint, string> = {
  decide: "Decide",
  extract: "Extract",
  fill: "Fill",
  pii: "Protect",
  injection: "Guard",
  script: "Inspect",
  grounding: "Verify",
  compare: "Compare",
  rerank: "Rerank",
  pipeline: "Pipeline",
};

const ENDPOINT_GROUP: Record<Endpoint, "read" | "safe" | "check" | "flow"> = {
  decide: "read",
  extract: "read",
  fill: "read",
  pii: "safe",
  injection: "safe",
  script: "safe",
  grounding: "check",
  compare: "check",
  rerank: "check",
  pipeline: "flow",
};

const GROUP_CLASS = {
  read: "bg-info-soft text-info",
  safe: "bg-stop-soft text-stop",
  check: "bg-ok-soft text-ok",
  flow: "bg-surface-2 text-ink-2",
};

export function EndpointChip({ endpoint, count, className }: { endpoint: Endpoint; count?: number; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium leading-5 tracking-tight",
        GROUP_CLASS[ENDPOINT_GROUP[endpoint]],
        className,
      )}
    >
      {ENDPOINT_NAME[endpoint]}
      {count !== undefined && count > 1 ? <span className="font-normal">×{count}</span> : null}
    </span>
  );
}

/** Maps an engine source label ("Extract", "checks", "code match") to a chip. */
export function SourceChip({ source }: { source: string }) {
  const ep = (Object.entries(ENDPOINT_NAME).find(([, name]) => name === source)?.[0] ?? null) as Endpoint | null;
  if (ep) return <EndpointChip endpoint={ep} />;
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 font-mono text-[11px] leading-5 text-muted">
      {source === "checks" ? "arithmetic" : source}
    </span>
  );
}

export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </Comp>
  );
}

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

export function Icon({ name, className }: { name: "stop" | "money" | "review" | "info" | "check" | "arrow" | "lock" | "copy" | "file" | "shield" | "spark" | "replay" | "back" | "sun" | "moon" | "external" | "download"; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    stop: (
      <>
        <path {...common} d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" />
        <path {...common} d="M12 8v5M12 16.5v.01" />
      </>
    ),
    money: (
      <>
        <rect {...common} x="3" y="6" width="18" height="12" rx="2" />
        <circle {...common} cx="12" cy="12" r="2.5" />
      </>
    ),
    review: (
      <>
        <circle {...common} cx="12" cy="12" r="9" />
        <path {...common} d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 16.5v.01" />
      </>
    ),
    info: (
      <>
        <circle {...common} cx="12" cy="12" r="9" />
        <path {...common} d="M12 11v5M12 8v.01" />
      </>
    ),
    check: <path {...common} d="M5 12.5l4.5 4.5L19 7.5" />,
    arrow: <path {...common} d="M5 12h14M13 6l6 6-6 6" />,
    back: <path {...common} d="M19 12H5M11 6l-6 6 6 6" />,
    lock: (
      <>
        <rect {...common} x="5" y="11" width="14" height="9" rx="2" />
        <path {...common} d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    copy: (
      <>
        <rect {...common} x="9" y="9" width="11" height="11" rx="2" />
        <path {...common} d="M5 15V5a1 1 0 0 1 1-1h10" />
      </>
    ),
    file: (
      <>
        <path {...common} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path {...common} d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
    shield: <path {...common} d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
    spark: <path {...common} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
    replay: (
      <>
        <path {...common} d="M4 12a8 8 0 1 0 2.4-5.7" />
        <path {...common} d="M4 4v4h4" />
      </>
    ),
    sun: (
      <>
        <circle {...common} cx="12" cy="12" r="4" />
        <path {...common} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path {...common} d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
    external: (
      <>
        <path {...common} d="M14 4h6v6M20 4l-9 9" />
        <path {...common} d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </>
    ),
    download: (
      <>
        <path {...common} d="M12 4v11M7 10l5 5 5-5" />
        <path {...common} d="M5 20h14" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={clsx("h-4 w-4 shrink-0", className)}>
      {paths[name]}
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("cuadra-theme", next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}

export function Logo({ className }: { className?: string }) {
  // The wordmark from lib/ui/brand.ts: «cuadra» with the accountant's double rule.
  return (
    <span className={clsx("inline-flex items-center", className)}>
      <svg viewBox={WORDMARK.viewBox} className="h-[26px] w-auto" role="img" aria-label="Cuadra">
        <g transform={WORDMARK.transform}>
          <path d={WORDMARK.letters} className="fill-ink" />
          {WORDMARK.rules.map((d) => (
            <path key={d} d={d} className="fill-accent" />
          ))}
        </g>
      </svg>
    </span>
  );
}
