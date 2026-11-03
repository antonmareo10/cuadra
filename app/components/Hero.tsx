"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EASE, Icon } from "./ui";

const HEADLINE = ["Pay", "for", "what", "actually", "arrived."];

function MagneticLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
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
    <motion.a
      ref={ref}
      href={href}
      style={{ x, y }}
      onPointerMove={onMove}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
      className={
        primary
          ? "group inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper shadow-card transition-colors hover:bg-ink-2"
          : "group inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-6 text-[15px] font-medium text-ink transition-colors hover:bg-surface"
      }
    >
      {children}
      <Icon name="arrow" className="transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1" />
    </motion.a>
  );
}

export function Hero({ stats }: { stats: ReactNode }) {
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

  return (
    <div ref={box} onPointerMove={onMove} className="relative overflow-hidden">
      {pointer && !reduce ? (
        <motion.div
          aria-hidden
          style={{ x: sx, y: sy }}
          className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
        >
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_28%,transparent),transparent_65%)]" />
        </motion.div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_65%)] blur-3xl" />
      )}
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-24">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[13px] text-muted backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Three-way match for small restaurants · built on Clocked
        </motion.p>
        <h1 className="max-w-4xl text-[clamp(2.6rem,7.5vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
          {HEADLINE.map((w, i) => (
            <span key={w + i} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom">
              <motion.span
                className={`inline-block ${w === "arrived." ? "text-accent" : ""}`}
                initial={reduce ? { opacity: 0 } : { y: "105%" }}
                animate={reduce ? { opacity: 1 } : { y: "0%" }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.08 + i * 0.06 }}
              >
                {w}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.4 }}
          className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-lg"
        >
          Cuadra reads the order, the delivery note and the supplier&apos;s invoice, checks every line against each other, and tells
          you what to pay, what to claim back, and which invoices not to touch at all.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.5 }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <MagneticLink href="#cases" primary>
            Open a recorded case
          </MagneticLink>
          <MagneticLink href="#how">How it works</MagneticLink>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.65 }} className="mt-14">
          {stats}
        </motion.div>
      </div>
    </div>
  );
}
