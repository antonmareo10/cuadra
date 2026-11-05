"use client";

import clsx from "clsx";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProofItem } from "@/lib/ui/proof";
import { Icon } from "./ui";

const LINES = [
  ["Pay", "the", "right", "amount,"],
  ["to", "the", "right", "account."],
];

const MotionLink = motion.create(Link);

function MagneticLink({ href, children }: { href: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 260, damping: 18 });
  const y = useSpring(0, { stiffness: 260, damping: 18 });
  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set(Math.max(-6, Math.min(6, ((e.clientX - r.left) / r.width - 0.5) * 12)));
    y.set(Math.max(-6, Math.min(6, ((e.clientY - r.top) / r.height - 0.5) * 12)));
  };
  return (
    <MotionLink
      ref={ref}
      href={href}
      style={{ x, y }}
      onPointerMove={onMove}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
      className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper shadow-card transition-colors hover:bg-ink-2"
    >
      {children}
      <Icon name="arrow" className="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1" />
    </MotionLink>
  );
}

function ProofCard({ proof }: { proof: ProofItem[] }) {
  if (!proof.length) return null;
  return (
    <figure
      style={{ animationDelay: "350ms" }}
      className="anim-fade-up relative min-w-0 rounded-3xl border border-line bg-surface p-4 shadow-card sm:p-6"
      aria-labelledby="proof-caption"
    >
      <figcaption id="proof-caption" className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span>Two invoices from the demo</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px]">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> recorded Clocked runs
        </span>
      </figcaption>
      <div className="mt-4 divide-y divide-line">
        {proof.map((p) => (
          <article key={p.caseId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span
                className={clsx(
                  "rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                  p.tone === "warn" ? "bg-warn-soft text-warn" : "bg-stop-soft text-stop",
                )}
              >
                {p.kicker}
              </span>
              <span className={clsx("text-[15px] font-semibold tracking-tight", p.tone === "warn" ? "text-warn" : "text-stop")}>{p.result}</span>
            </div>
            <h2 className="mt-2 text-[15px] font-semibold leading-snug tracking-tight">{p.title}</h2>
            <ul className="mt-3 space-y-2">
              {p.sources.map((s) => (
                <li key={`${s.doc}-${s.line}`}>
                  <p className="text-[12px] text-muted">
                    <span className="font-medium text-ink-2">{`${s.doc}, line ${s.line}`}</span>
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                  <p className="mt-1 break-words rounded-lg bg-paper px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-ink-2">
                    {s.before}
                    <mark className={clsx("rounded-[3px] px-0.5 text-ink", p.tone === "warn" ? "bg-warn-soft shadow-[inset_0_-2px_0_var(--warn)]" : "bg-stop-soft shadow-[inset_0_-2px_0_var(--stop)]")}>
                      {s.match}
                    </mark>
                    {s.after}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              {p.outcome}{" "}
              <Link href={`/case/${p.caseId}`} className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                Open this case
              </Link>
            </p>
          </article>
        ))}
      </div>
    </figure>
  );
}

export function Hero({ stats, proof, video }: { stats: ReactNode; proof: ProofItem[]; video: string }) {
  const reduce = useReducedMotion();
  const [pointer, setPointer] = useState(false);
  const bx = useMotionValue(0);
  const by = useMotionValue(0);
  const sx = useSpring(bx, { stiffness: 60, damping: 20 });
  const sy = useSpring(by, { stiffness: 60, damping: 20 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPointer(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const onMove = (e: React.PointerEvent) => {
    if (!box.current || reduce || !pointer) return;
    const r = box.current.getBoundingClientRect();
    bx.set(e.clientX - r.left - 260);
    by.set(e.clientY - r.top - 260);
  };

  let w = 0;
  return (
    <div ref={box} onPointerMove={onMove} className="relative overflow-hidden">
      {pointer && !reduce ? (
        <motion.div
          aria-hidden
          style={{ x: sx, y: sy }}
          className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
        >
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_65%)]" />
        </motion.div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_65%)] blur-3xl" />
      )}
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
          <div className="min-w-0">
            <p
              className="anim-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[13px] text-ink-2 backdrop-blur"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Supplier invoice checks for small restaurants
            </p>
            <h1 className="text-[clamp(2rem,8.4vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[min(3.4rem,4.4vw)]">
              {LINES.map((line, li) => (
                <span key={li} className="block">
                  {line.map((word) => {
                    const i = w++;
                    return (
                      <span key={i} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom">
                        <span className={clsx("anim-rise inline-block", li === 1 && "text-accent")} style={{ animationDelay: `${80 + i * 50}ms` }}>
                          {word}
                        </span>
                      </span>
                    );
                  })}
                </span>
              ))}
            </h1>
            <p
              style={{ animationDelay: "400ms" }}
              className="anim-fade-up mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2 sm:text-lg"
            >
              Cuadra reads the chef&apos;s order, the delivery note the kitchen signed and the supplier&apos;s invoice. It tells the owner
              what to pay, what to claim back and which invoices to hold, and every finding points to the line it was printed on.
            </p>
            <div
              style={{ animationDelay: "500ms" }}
              className="anim-fade-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3"
            >
              <MagneticLink href="/case/meat-short-weight">See an invoice checked</MagneticLink>
              <a
                href={video}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full text-[15px] font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink"
              >
                Watch the one-minute video
                <Icon name="external" className="h-3.5 w-3.5" />
              </a>
            </div>
            <p style={{ animationDelay: "600ms" }} className="anim-fade-up mt-4 text-[13px] text-muted">
              No sign-up. The five sample cases open instantly on a phone or a laptop.
            </p>
          </div>
          <ProofCard proof={proof} />
        </div>
        <div style={{ animationDelay: "650ms" }} className="anim-fade-up mt-14">
          {stats}
        </div>
      </div>
    </div>
  );
}
