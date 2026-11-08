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

const navLink = "min-h-11 items-center px-3 decoration-[1.5px] underline-offset-[7px] hover:underline";

/** The header is the coloured band printed across the top of a delivery note. */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-desk text-on-desk">
      <div className="shell flex h-14 items-center justify-between gap-3 sm:h-16">
        <Link href="/" prefetch={false} className="-ml-1 inline-flex min-h-11 items-center px-1" aria-label="Cuadra home">
          <Logo on="desk" size="h-[24px] sm:h-[26px]" />
        </Link>
        {children}
        <nav aria-label="Main" className="flex items-center text-[14px] font-medium">
          <Link href="/#cases" className={`${navLink} hidden sm:inline-flex`}>
            Cases
          </Link>
          <Link href="/#how" className={`${navLink} hidden md:inline-flex`}>
            How it works
          </Link>
          <Link href="/assistants" className={`${navLink} hidden sm:inline-flex`}>
            Assistants
          </Link>
          <Link href="/check" className={`${navLink} hidden lg:inline-flex`}>
            Live run
          </Link>
          <a href={SITE.repo} target="_blank" rel="noreferrer" className={`${navLink} inline-flex gap-1.5`}>
            <GitHubMark className="h-4 w-4" />
            Code
          </a>
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-white/25 sm:block" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

const footLink = "group inline-flex min-h-10 items-center gap-2 text-white decoration-[1.5px] underline-offset-[6px] hover:underline";

export function SiteFooter() {
  return (
    <footer className="desk-grid text-on-desk">
      <div className="shell pb-6 pt-16 sm:pt-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="space-y-4 text-[14px] leading-relaxed text-white/80 lg:col-span-5">
            <p>
              Built by Antonio González for the Clocked Build Challenge 2026. The sample documents are synthetic: the restaurant, the suppliers, the people
              and the bank accounts are made up.
            </p>
            <p>
              Uses all ten endpoints of the{" "}
              <a className="text-white underline underline-offset-4" href={SITE.clockedDocs} target="_blank" rel="noreferrer">
                Clocked API
              </a>{" "}
              by rezolve.ai: <span className="font-mono text-[11.5px] text-white">{ENDPOINTS.join(" · ")}</span>.
            </p>
          </div>
          <ul className="space-y-1 text-[15px] lg:col-span-5 lg:col-start-8">
            <li>
              <a className={footLink} href={SITE.repo} target="_blank" rel="noreferrer">
                <GitHubMark className="h-4 w-4" /> Source code and setup (MIT)
              </a>
            </li>
            <li>
              <a className={footLink} href={SITE.video} target="_blank" rel="noreferrer">
                Demo video
              </a>
            </li>
            <li>
              <Link className={footLink} href="/assistants">
                Use it from an AI assistant (MCP)
              </Link>
            </li>
            <li>
              <a className={footLink} href={SITE.failureHandling} target="_blank" rel="noreferrer">
                How it handles uncertain results and failed requests
              </a>
            </li>
            <li>
              <Link className={footLink} href="/check">
                Live run with your own files
              </Link>
            </li>
          </ul>
        </div>
        <div aria-hidden className="mt-16 sm:mt-24">
          <Logo on="desk" size="h-auto w-full" />
        </div>
        <p className="mt-5 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-white/75">
          <span>Pay the right amount, to the right account.</span>
          <span>Clocked Build Challenge · 2026</span>
        </p>
      </div>
    </footer>
  );
}
