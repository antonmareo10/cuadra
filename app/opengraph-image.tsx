import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { RunResult } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import { RECEIPT, TICK } from "@/lib/ui/brand";

// Social preview (link unfurls on LinkedIn, Slack, the entry form). Rendered once at build time
// from the recorded runs, with the same mark, colours and typeface as the site.
export const alt = "Cuadra: pay the right amount, to the right account. Supplier invoice checks for small restaurants.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { paper: "#f5f2ea", surface: "#fffdf8", ink: "#1b1a17", ink2: "#3a3832", muted: "#6a665c", line: "#e0d9cb", accent: "#c8432a", warn: "#855a06", warnSoft: "#f6ecd2", stop: "#b3261e", stopSoft: "#f8e1dd" };

async function run(id: string): Promise<RunResult> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "runs", `${id}.json`), "utf8"));
}

export default async function Image() {
  const fonts = path.join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans");
  const [semibold, regular, meat, fish] = await Promise.all([
    fs.readFile(path.join(fonts, "Geist-SemiBold.ttf")),
    fs.readFile(path.join(fonts, "Geist-Regular.ttf")),
    run("meat-short-weight"),
    run("fish-bank-change"),
  ]);
  const m = meat.verdict;
  const f = fish.verdict;
  const rows = [
    { tone: C.warn, soft: C.warnSoft, label: "Right amount", text: `Meat invoice, printed ${eur(m.invoiceTotal ?? 0)}: pay ${eur(m.payNow)}, claim ${eur(m.disputed)}` },
    { tone: C.stop, soft: C.stopSoft, label: "Right account", text: `Fish invoice, printed ${eur(f.invoiceTotal ?? 0)}: new IBAN and a hidden note for AI, held` },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.paper, padding: "56px 68px", fontFamily: "Geist", color: C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill={C.ink} />
            <path d={RECEIPT} fill={C.paper} />
            <path d={TICK} fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>cuadra</span>
          <span style={{ marginLeft: "auto", fontSize: 22, color: C.muted }}>Supplier invoice checks for small restaurants</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, fontSize: 76, fontWeight: 600, letterSpacing: -2.8, lineHeight: 1.02 }}>
          <span>Pay the right amount,</span>
          <span style={{ color: C.accent }}>to the right account.</span>
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 27, color: C.ink2, lineHeight: 1.35, maxWidth: 1000 }}>
          Checks each invoice against the chef&apos;s order and the signed delivery note. Every finding points to its line.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: "auto" }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 16, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: "14px 20px", fontSize: 24 }}>
              <span style={{ background: r.soft, color: r.tone, borderRadius: 999, padding: "4px 14px", fontSize: 20, fontWeight: 600 }}>{r.label}</span>
              <span style={{ color: C.ink2 }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
