"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Prefetches a route once the page has loaded and the browser is idle, instead of as soon as its link
 * is on screen: the case page (and the animation code it brings) then never competes with the first
 * screen on a phone, and the click is still instant.
 */
export function PrefetchLater({ href, after = 2500 }: { href: string; after?: number }) {
  const router = useRouter();
  useEffect(() => {
    let idle = 0;
    const t = window.setTimeout(() => {
      const go = () => router.prefetch(href);
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(go, { timeout: 3000 });
      else go();
    }, after);
    return () => {
      window.clearTimeout(t);
      if (idle) window.cancelIdleCallback(idle);
    };
  }, [href, after, router]);
  return null;
}
