// node scripts/record-video.mjs [baseUrl]
//
// Records the demo video (docs/video/cuadra-demo.mp4) from a running server (npm run start):
// drives a headless Chromium browser over the DevTools protocol (no extra dependencies),
// captures a screencast, and encodes it with ffmpeg. Captions are drawn in the page.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3000";
const W = 1440;
const H = 900;
const PORT = 9333;
const browserPath = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
if (!browserPath) throw new Error("No Chromium-based browser found; set BROWSER");

const outDir = path.join(process.cwd(), "docs", "video");
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuadra-frames-"));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cuadra-prof-"));
fs.mkdirSync(outDir, { recursive: true });

const proc = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, init) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return r.json();
    } catch {}
    await sleep(500);
  }
  throw new Error("browser did not start");
}

const target = await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const frames = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  } else if (msg.method === "Page.screencastFrame") {
    const n = frames.length;
    const file = path.join(frameDir, `f${String(n).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(msg.params.data, "base64"));
    frames.push({ file, t: msg.params.metadata.timestamp });
    send("Page.screencastFrameAck", { sessionId: msg.params.sessionId });
  }
});
function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((r) => pending.set(msgId, r));
}
const evaluate = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });

async function go(url) {
  await send("Page.navigate", { url: base + url });
  await sleep(2200);
}
async function caption(text) {
  await evaluate(`(() => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;background:rgba(20,20,18,.88);color:#f5f2ea;font:500 22px/1.35 system-ui,sans-serif;padding:12px 22px;border-radius:14px;max-width:1100px;text-align:center;transition:opacity .3s";
      document.body.appendChild(el);
    }
    el.style.opacity = ${text ? 1 : 0};
    el.textContent = ${JSON.stringify(text)};
  })()`);
}
async function scrollTo(selectorOrY, ms = 1400) {
  await evaluate(`(() => {
    const t = ${typeof selectorOrY === "number" ? selectorOrY : `document.querySelector(${JSON.stringify(selectorOrY)})`};
    const y = typeof t === "number" ? t : t.getBoundingClientRect().top + window.scrollY - 90;
    const y0 = window.scrollY, dy = y - y0, d = ${ms}, s = performance.now();
    return new Promise(res => { const step = now => { const k = Math.min(1, (now - s) / d); const e = 1 - Math.pow(1 - k, 3); window.scrollTo(0, y0 + dy * e); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  })()`);
  await sleep(300);
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

// Storyboard
await go("/");
await caption("Restaurants pay supplier invoices without checking what actually arrived.");
await sleep(3200);
await caption("Cuadra reads the order, the delivery note and the invoice, and says what to pay.");
await scrollTo("#cases", 1600);
await sleep(2200);
await go("/case/meat-short-weight");
await caption("Meat ordered on WhatsApp: pay €365.42 now, claim €42.81, ask the kitchen about €18.70.");
await sleep(3800);
await scrollTo("#issues", 1400);
await caption("Every discrepancy has its formula, its evidence and Decide's recommendation.");
await sleep(3500);
await click("#issues button[title='Show in the document']");
await caption("Click a quote and it is highlighted in the document's own text, where Extract read it.");
await sleep(3800);
await scrollTo("#email", 1600);
await caption("Fill writes the email to the supplier; Verify checks every claim before you copy it.");
await sleep(4000);
await go("/case/fish-bank-change");
await caption("This fish invoice adds up perfectly. Cuadra still says: do not pay it.");
await sleep(3800);
await scrollTo("#safety", 1600);
await caption("New IBAN (Protect), hidden instructions for AI (Guard), and a script in the PDF (Inspect).");
await sleep(4500);
await go("/case/veg-duplicate");
await caption("And this one was already paid: Compare finds the same delivery invoiced twice.");
await sleep(3800);
await scrollTo("#calls", 1800);
await caption("All ten Clocked endpoints, about 18 calls and 10 seconds per invoice. Real recordings.");
await sleep(3800);
await caption("");
await sleep(400);
await send("Page.stopScreencast");
ws.close();
proc.kill();

// Encode at constant 30 fps using each frame's real duration.
const list = frames
  .map((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    return `file '${f.file.replace(/\\/g, "/")}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`;
  })
  .join("\n");
const listFile = path.join(frameDir, "list.txt");
fs.writeFileSync(listFile, list + `\nfile '${frames.at(-1).file.replace(/\\/g, "/")}'\n`);
const out = path.join(outDir, "cuadra-demo.mp4");
execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", out], {
  stdio: "inherit",
});
console.log(`saved ${path.relative(process.cwd(), out)} from ${frames.length} frames`);
