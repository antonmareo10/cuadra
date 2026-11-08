"use client";

import clsx from "clsx";
import { createElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Endpoint } from "@/lib/clocked/client";
import { BRAND, WORDMARK } from "@/lib/ui/brand";

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
        "inline-flex items-center gap-1 rounded-[2px] px-1.5 py-px font-mono text-[10.5px] font-medium leading-5 tracking-[-0.01em]",
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
    <span className="inline-flex items-center rounded-[2px] border border-line px-1.5 py-px font-mono text-[10.5px] leading-5 text-muted">
      {source === "checks" ? "arithmetic" : source}
    </span>
  );
}

/**
 * Fades a block in the first time it scrolls into view. The server HTML shows it (no JavaScript, or
 * already on screen at load: nothing hides); only a block below the fold waits for the reader.
 * CSS does the motion (.reveal-*), so the landing page ships no animation library.
 */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"still" | "wait" | "shown">("still");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("wait");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return createElement(
    as,
    {
      ref,
      className: clsx(className, state === "wait" && "reveal-wait", state === "shown" && "reveal-in"),
      style: state === "shown" && delay ? { transitionDelay: `${Math.round(delay * 1000)}ms` } : undefined,
    },
    children,
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
      className="inline-flex h-11 w-11 items-center justify-center text-current/80 transition-colors hover:bg-white/10 hover:text-current"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} className="h-[18px] w-[18px]" />
    </button>
  );
}

export function Logo({ className, on = "page", size = "h-[26px]" }: { className?: string; on?: "page" | "desk"; size?: string }) {
  // The wordmark from lib/ui/brand.ts: «cuadra» with the accountant's double rule.
  // On the blue desk it uses the brand's own colours for dark grounds (BRAND.inkDark, BRAND.accentDark).
  return (
    <span className={clsx("inline-flex items-center", className)}>
      <svg viewBox={WORDMARK.viewBox} className={clsx(size, !size.includes("w-") && "w-auto")} role="img" aria-label="Cuadra">
        <g transform={WORDMARK.transform}>
          <path d={WORDMARK.letters} className={on === "page" ? "fill-ink" : undefined} fill={on === "desk" ? BRAND.inkDark : undefined} />
          {WORDMARK.rules.map((d) => (
            <path key={d} d={d} className={on === "page" ? "fill-accent" : undefined} fill={on === "desk" ? BRAND.accentDark : undefined} />
          ))}
        </g>
      </svg>
    </span>
  );
}

/**
 * The rubber stamp: the one decision, in red ink. It lands once (CSS, so it also runs before hydration);
 * with reduced motion it is simply there.
 */
export function Stamp({
  children,
  sub,
  rotate = -7,
  delay = 0,
  animate = true,
  tone = "accent",
  className,
  style,
}: {
  children: ReactNode;
  sub?: ReactNode;
  rotate?: number;
  delay?: number;
  animate?: boolean;
  /** "paper": the stamp sits on a white document in either theme, so it keeps the light-theme red. */
  tone?: "accent" | "ok" | "info" | "warn" | "paper";
  className?: string;
  style?: React.CSSProperties;
}) {
  const color = { accent: "text-accent", ok: "text-ok", info: "text-info", warn: "text-warn", paper: "text-[#cf2416]" }[tone];
  return (
    <span
      className={clsx("stamp", animate && "stamp-in", color, className)}
      style={{ ["--r" as string]: `${rotate}deg`, animationDelay: animate ? `${delay}ms` : undefined, ...style }}
    >
      <span>{children}</span>
      {sub ? <span className="stamp-sub">{sub}</span> : null}
    </span>
  );
}

/** A link with a slight magnetic pull towards the pointer (≤ 6 px). Off on touch and with reduced motion. */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 6;
    const dy = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 4;
    el.style.setProperty("--mx", `${Math.max(-6, Math.min(6, dx)).toFixed(1)}px`);
    el.style.setProperty("--my", `${Math.max(-4, Math.min(4, dy)).toFixed(1)}px`);
  };
  const leave = () => {
    ref.current?.style.setProperty("--mx", "0px");
    ref.current?.style.setProperty("--my", "0px");
  };
  return (
    <span ref={ref} onPointerMove={move} onPointerLeave={leave} className={clsx("magnet inline-flex", className)}>
      {children}
    </span>
  );
}
