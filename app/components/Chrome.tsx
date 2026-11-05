import Link from "next/link";
import { SITE } from "@/lib/site";
import { Logo, ThemeToggle } from "./ui";

const ENDPOINTS = ["Pipeline", "Guard", "Protect", "Inspect", "Extract", "Rerank", "Compare", "Verify", "Decide", "Fill"];

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="Cuadra home">
          <Logo />
        </Link>
        {children}
        <nav aria-label="Main" className="flex items-center gap-1 text-[14px]">
          <Link href="/#cases" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
            Cases
          </Link>
          <Link href="/#how" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink md:inline-flex">
            How it works
          </Link>
          <Link href="/assistants" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink sm:inline-flex">
            Assistants
          </Link>
          <Link href="/check" className="hidden rounded-full px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink lg:inline-flex">
            Live run
          </Link>
          <a
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <GitHubMark className="h-4 w-4" />
            Code
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 text-[13px] text-muted sm:px-6 md:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md leading-relaxed">
            Built by Antonio González for the Clocked Build Challenge 2026. The sample documents are synthetic: the restaurant, the suppliers, the
            people and the bank accounts are made up.
          </p>
          <p className="max-w-md leading-relaxed">
            Uses all ten endpoints of the{" "}
            <a className="underline underline-offset-2 hover:text-ink" href={SITE.clockedDocs} target="_blank" rel="noreferrer">
              Clocked API
            </a>{" "}
            by rezolve.ai: <span className="font-mono text-[12px] text-ink-2">{ENDPOINTS.join(" · ")}</span>.
          </p>
        </div>
        <ul className="space-y-2 md:justify-self-end">
          <li>
            <a className="inline-flex min-h-9 items-center gap-2 hover:text-ink" href={SITE.repo} target="_blank" rel="noreferrer">
              <GitHubMark className="h-3.5 w-3.5" /> Source code and setup (MIT)
            </a>
          </li>
          <li>
            <a className="inline-flex min-h-9 items-center hover:text-ink" href={SITE.video} target="_blank" rel="noreferrer">
              Demo video, two minutes
            </a>
          </li>
          <li>
            <Link className="inline-flex min-h-9 items-center hover:text-ink" href="/assistants">
              Use it from an AI assistant (MCP)
            </Link>
          </li>
          <li>
            <a className="inline-flex min-h-9 items-center hover:text-ink" href={SITE.failureHandling} target="_blank" rel="noreferrer">
              How it handles uncertain results and failed requests
            </a>
          </li>
          <li>
            <Link className="inline-flex min-h-9 items-center hover:text-ink" href="/check">
              Live run with your own files
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
