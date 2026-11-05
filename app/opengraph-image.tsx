import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { RunResult } from "@/lib/engine/types";
import { eur } from "@/lib/money";
import { BRAND, WORDMARK } from "@/lib/ui/brand";

// Social preview (link unfurls on LinkedIn, Slack, the entry form). Rendered once at build time
// from the recorded runs and the demo's own delivery-note photo, with the site's logo and typefaces.
export const alt = "Cuadra: pay the right amount, to the right account. A phone photo of a delivery note, checked against the order and the invoice.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { paper: BRAND.paper, surface: "#fffdf8", ink: BRAND.ink, ink2: "#3a3832", muted: "#6a665c", line: "#e0d9cb", accent: BRAND.accent, warn: "#855a06", warnSoft: "#f6ecd2", stop: "#b3261e", stopSoft: "#f8e1dd" };

async function run(id: string): Promise<RunResult> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "runs", `${id}.json`), "utf8"));
}

export default async function Image() {
  const fonts = path.join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans");
  const [semibold, regular, serif, serifItalic, photo, meat, fish] = await Promise.all([
    fs.readFile(path.join(fonts, "Geist-SemiBold.ttf")),
    fs.readFile(path.join(fonts, "Geist-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "app", "fonts", "InstrumentSerif-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "app", "fonts", "InstrumentSerif-Italic.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "paper", "meat-photo-delivery", "delivery.jpg")),
    run("meat-short-weight"),
    run("fish-bank-change"),
  ]);
  const m = meat.verdict;
  const f = fish.verdict;
  const rows = [
    { tone: C.warn, soft: C.warnSoft, label: "Right amount", text: `Meat: pay ${eur(m.payNow)}, claim ${eur(m.disputed)}` },
    { tone: C.stop, soft: C.stopSoft, label: "Right account", text: `Fish: new IBAN, hidden note for AI, ${eur(f.invoiceTotal ?? 0)} held` },
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.paper, fontFamily: "Geist", color: C.ink, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 680, padding: "52px 0 48px 64px" }}>
          <svg width="142" height="45" viewBox={WORDMARK.viewBox}>
            <g transform={WORDMARK.transform}>
              <path d={WORDMARK.letters} fill={C.ink} />
              {WORDMARK.rules.map((d) => (
                <path key={d} d={d} fill={C.accent} />
              ))}
            </g>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 38, fontFamily: "Instrument Serif", fontSize: 84, lineHeight: 0.98, letterSpacing: -1 }}>
            <span>Pay the right amount,</span>
            <span style={{ color: C.accent, fontStyle: "italic" }}>to the right account.</span>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 25, color: C.ink2, lineHeight: 1.38, maxWidth: 600 }}>
            A photo of the delivery note, checked against the chef&apos;s order and the invoice. Every finding points to its line.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 20 }}>
                <span style={{ background: r.soft, color: r.tone, borderRadius: 999, padding: "4px 13px", fontSize: 18, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{r.label}</span>
                <span style={{ color: C.ink2 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", right: -40, top: 92, transform: "rotate(3deg)", boxShadow: "0 30px 60px -20px rgba(27,26,23,0.55)", borderRadius: 12, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/jpeg;base64,${photo.toString("base64")}`} width={560} height={420} alt="" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Serif", data: serif, weight: 400, style: "normal" },
        { name: "Instrument Serif", data: serifItalic, weight: 400, style: "italic" },
      ],
    },
  );
}
