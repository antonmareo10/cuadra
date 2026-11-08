import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./components/Chrome";
import { Icon } from "./components/ui";

export const metadata: Metadata = { title: "Page not found · Cuadra" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
        <p className="font-mono text-[13px] text-muted">404</p>
        <h1 className="mt-3 text-[clamp(2rem,6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">This page is not on the invoice.</h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">
          The link may be mistyped, or the case was renamed. The five recorded cases are all on the home page.
        </p>
        <Link
          href="/#cases"
          className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-[2px] bg-ink px-6 text-[15px] font-medium text-paper shadow-card hover:bg-ink-2"
        >
          See the five cases <Icon name="arrow" />
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
