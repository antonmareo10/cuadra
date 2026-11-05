// node scripts/record-video.mjs [baseUrl]
//
// Records the demo video (docs/video/cuadra-demo.mp4) from a running server (npm run start):
// drives a headless browser over the DevTools protocol, captures a screencast and encodes
// it with ffmpeg (set FFMPEG=/path/to/ffmpeg if it is not on PATH). Captions are drawn in the page.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep } from "./lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const outDir = path.join(process.cwd(), "docs", "video");
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuadra-frames-"));
fs.mkdirSync(outDir, { recursive: true });

const b = await launch({ width: 1440, height: 900, port: 9334 });
const frames = [];
b.on("Page.screencastFrame", (p) => {
  const file = path.join(frameDir, `f${String(frames.length).padStart(6, "0")}.jpg`);
  fs.writeFileSync(file, Buffer.from(p.data, "base64"));
  frames.push({ file, t: p.metadata.timestamp });
  b.send("Page.screencastFrameAck", { sessionId: p.sessionId });
});

async function caption(text) {
  await b.evaluate(`(() => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9999;background:rgba(20,20,18,.9);color:#f5f2ea;font:500 23px/1.35 system-ui,sans-serif;padding:13px 24px;border-radius:14px;max-width:1120px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25)";
      document.body.appendChild(el);
    }
    el.style.display = ${text ? "'block'" : "'none'"};
    el.textContent = ${JSON.stringify(text)};
  })()`);
}

// Light theme for legibility
await b.goto(base + "/", 1500);
await b.theme("light");
await b.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });

await b.goto(base + "/", 400);
await caption("Restaurants pay supplier invoices without checking them against what arrived.");
await sleep(3600);
await caption("Cuadra checks every line, and every finding points to the line it was printed on.");
await b.scrollTo("#cases", 1600);
await sleep(2400);

await b.goto(base + "/case/meat-short-weight", 300);
await caption("Meat ordered on WhatsApp: pay €365.42 now, claim €42.81, ask the kitchen about €18.70.");
await sleep(4200);
await b.scrollTo("#issues", 1400);
await caption("Every discrepancy comes with its formula, its evidence and Decide's recommendation.");
await sleep(3800);
await b.click("#issues button[title^='Show']");
await caption("Click a quote and the document opens at that line, where Extract read it.");
await sleep(4200);
await b.scrollTo("#email", 1600);
await caption("Fill writes the email to the supplier. Verify checks every claim before you can copy it.");
await sleep(4400);

await b.goto(base + "/case/fish-bank-change", 300);
await caption("This fish invoice adds up to the cent. Cuadra still says: do not pay it.");
await sleep(4000);
await b.scrollTo("#safety", 1600);
await caption("A new IBAN (Protect), hidden instructions for AI (Guard) and a script in the PDF (Inspect).");
await sleep(5000);

await b.goto(base + "/case/veg-duplicate", 300);
await caption("And this one was already paid. Compare finds the same delivery invoiced twice.");
await sleep(4200);
await b.scrollTo("#calls", 1800);
await caption("All ten Clocked endpoints, 15 to 19 calls per invoice. Real recordings, replayed.");
await sleep(4200);
await caption("");
await sleep(500);
await b.send("Page.stopScreencast");
await b.close();

if (!frames.length) throw new Error("no frames captured");
const lines = [];
frames.forEach((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
lines.push(`file '${frames.at(-1).file.replace(/\\/g, "/")}'`);
const listFile = path.join(frameDir, "list.txt");
fs.writeFileSync(listFile, lines.join("\n") + "\n");
const out = path.join(outDir, "cuadra-demo.mp4");
execFileSync(
  ffmpeg,
  ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,scale=1440:-2,format=yuv420p", "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-movflags", "+faststart", out],
  { stdio: "ignore" },
);
console.log(`saved ${path.relative(process.cwd(), out)} from ${frames.length} frames`);
process.exit(0);
