import Link from "next/link";
import { Logo, ThemeToggle } from "./ui";

const ENDPOINTS = ["Decide", "Extract", "Fill", "Protect", "Guard", "Inspect", "Verify", "Compare", "Rerank", "Pipeline"];

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="Cuadra home">
          <Logo />
        </Link>
        {children}
        <nav className="flex items-center gap-1 text-[14px]">
          <Link href="/#cases" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
            Cases
          </Link>
          <Link href="/#how" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
            How it works
          </Link>
          <Link href="/check" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink md:inline-flex">
            Live run
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const row = [...ENDPOINTS, ...ENDPOINTS];
  return (
    <footer className="mt-10 border-t border-line">
      <div className="marquee overflow-hidden py-5" aria-label="Clocked endpoints used">
        <div className="marquee-track flex w-max gap-10 whitespace-nowrap font-mono text-sm text-muted">
          {row.map((e, i) => (
            <span key={i} aria-hidden={i >= ENDPOINTS.length}>
              {e} <span className="text-line">/</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pb-10 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Cuadra · an entry to the Clocked Build Challenge 2026. Sample documents are synthetic; companies and people are fictional.</p>
        <p>
          Uses the{" "}
          <a className="underline underline-offset-2 hover:text-ink" href="https://clocked.rezolve.ai/docs" target="_blank" rel="noreferrer">
            Clocked API
          </a>{" "}
          by rezolve.ai.
        </p>
      </div>
    </footer>
  );
}
