/**
 * npx tsx scripts/video/capture.ts <appBaseUrl> <clipsDir> [shot ...]
 *
 * Records the shots of the demo video, one clip per narration line (v01 … v13), at 1920×1080:
 * a 1440×810 page with a real device pixel ratio of 4/3, captured with the DevTools screencast.
 * App shots run against a production build of this repository (npm run build && npx next start);
 * the close-ups, the MCP session and the end card are slides in scripts/video/slides, served from
 * the repository by a small static server. A visible cursor moves before every click.
 *
 * Writes <clipsDir>/<shot>.mp4 and marks.json (lead-in seconds per clip), the inputs of
 * _video-tools/video/assemble.mjs. Prints the frame count of every clip: a smooth take has about
 * 25 to 30 frames per second of page motion; if a clip comes out far below that, record it again
 * with the computer idle (CPU under ~40 %).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { findBrowser, sleep } from "../lib/cdp.mjs";
import { wordmarkSvg } from "../../lib/ui/brand";
import type { RunResult } from "../../lib/engine/types";
import { amountProof } from "../../lib/ui/proof";

const ROOT = process.cwd();
const [base = "http://localhost:3100", clipsArg = "C:/Users/anton/data/clocked/video/clips", ...only] = process.argv.slice(2);
const CLIPS = path.resolve(clipsArg);
fs.mkdirSync(CLIPS, { recursive: true });
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const W = 1440;
const H = 810;
const DSF = 4 / 3;

const readJson = <T>(...p: string[]): T => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

/* ------------------------------------------------------------------ browser */
async function launchBrowser(port: number) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cuadra-video-"));
  const proc = spawn(
    findBrowser(),
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W + 21},${H + 153}`, `--force-device-scale-factor=${DSF}`, "about:blank"],
    { stdio: "ignore" },
  );
  let target: { webSocketDebuggerUrl: string } | null = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
      if (r.ok) target = await r.json();
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(400);
  }
  if (!target) throw new Error("browser did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  const listeners = new Map<string, ((p: any) => void)[]>();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.result ?? msg.error);
      pending.delete(msg.id);
    } else if (msg.method && listeners.has(msg.method)) for (const fn of listeners.get(msg.method)!) fn(msg.params);
  });
  const send = (method: string, params: Record<string, unknown> = {}) => {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise<any>((r) => pending.set(msgId, r));
  };
  const evaluate = async (expression: string) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
  await send("Page.enable");
  await send("Runtime.enable");
  // The window size alone leaves browser chrome out of the viewport: pin the CSS viewport to 1440×810
  // at the same (real) pixel ratio, so frames come out at 1920×1080.
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  return {
    send,
    evaluate,
    on: (m: string, fn: (p: any) => void) => listeners.set(m, [...(listeners.get(m) ?? []), fn]),
    close: () => {
      try {
        ws.close();
      } catch {
        /* closed */
      }
      // proc.kill() leaves Chrome's child processes behind on Windows: end the whole tree.
      if (process.platform === "win32" && proc.pid) spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      else proc.kill();
    },
  };
}

type B = Awaited<ReturnType<typeof launchBrowser>>;

/* ------------------------------------------------------------------ slides server */
function serve(): Promise<{ url: string; close: () => void }> {
  const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close() })));
}

/* ------------------------------------------------------------------ page helpers */
const CURSOR = `(() => {
  if (document.getElementById("__cur")) return;
  const c = document.createElement("div");
  c.id = "__cur";
  c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2l19 13.2-8.7 1.6 5.2 10.4-3.9 1.9-5.2-10.4L3 24.6z" fill="#1b1a17" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  c.style.cssText = "position:fixed;left:1180px;top:640px;z-index:2147483647;pointer-events:none;transition:left .75s cubic-bezier(.45,.05,.25,1),top .75s cubic-bezier(.45,.05,.25,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))";
  document.body.appendChild(c);
  const r = document.createElement("div");
  r.id = "__ripple";
  r.style.cssText = "position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid #c8432a;opacity:0;z-index:2147483646;pointer-events:none;transform:scale(.4);transition:transform .45s ease,opacity .45s ease";
  document.body.appendChild(r);
})()`;

async function goto(b: B, url: string, wait = 2200) {
  await b.send("Page.navigate", { url });
  await sleep(wait);
  await b.evaluate(`localStorage.setItem("cuadra-theme","light"); document.documentElement.dataset.theme = "light"; window.scrollTo(0, 0); true`);
  await b.evaluate(CURSOR);
}

/** Smooth scroll so that the element (or y) sits `offset` px below the top. */
async function scrollTo(b: B, target: string | number, ms = 1200, offset = 84) {
  await b.evaluate(`(() => {
    const t = ${typeof target === "number" ? target : `document.querySelector(${JSON.stringify(target)})`};
    if (t === null) return;
    const y = typeof t === "number" ? t : t.getBoundingClientRect().top + window.scrollY - ${offset};
    const y0 = window.scrollY, dy = y - y0, d = ${ms}, s = performance.now();
    return new Promise(res => { const step = now => { const k = Math.min(1, (now - s) / d); const e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3)/2; window.scrollTo(0, y0 + dy * e); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
  })()`);
}

const jump = (b: B, target: string, offset = 84) => scrollTo(b, target, 1, offset);

/** Moves the cursor onto an element (or a point); with click, presses it. */
async function point(b: B, target: string | { x: number; y: number }, click = false, ms = 800) {
  const pos = await b.evaluate(`(() => {
    const t = ${typeof target === "string" ? `document.querySelector(${JSON.stringify(target)})` : "null"};
    let x = ${typeof target === "string" ? "0" : target.x}, y = ${typeof target === "string" ? "0" : target.y};
    if (t) { const r = t.getBoundingClientRect(); x = r.left + Math.min(r.width / 2, 60); y = r.top + r.height / 2; }
    const c = document.getElementById("__cur"); c.style.left = x + "px"; c.style.top = y + "px";
    return { x, y, found: Boolean(t) || ${typeof target !== "string"} };
  })()`);
  if (!pos?.found) throw new Error(`not found: ${JSON.stringify(target)}`);
  await sleep(ms);
  if (click) {
    await b.evaluate(`(() => {
      const r = document.getElementById("__ripple"); r.style.left = "${pos.x}px"; r.style.top = "${pos.y}px";
      r.style.transition = "none"; r.style.opacity = "1"; r.style.transform = "scale(.4)"; r.getBoundingClientRect();
      r.style.transition = "transform .45s ease, opacity .45s ease"; r.style.opacity = "0"; r.style.transform = "scale(1.4)";
      ${typeof target === "string" ? `document.querySelector(${JSON.stringify(target)}).click();` : ""}
    })()`);
  }
}

/** Finds a button by its visible text and gives it an id, so point() can use it. */
async function tagButton(b: B, text: string, id: string, within = "body") {
  const ok = await b.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(within)} + " button")].find(x => x.textContent.trim() === ${JSON.stringify(text)});
    if (el) el.id = ${JSON.stringify(id)};
    return Boolean(el);
  })()`);
  if (!ok) throw new Error(`button not found: ${text}`);
}

/* ------------------------------------------------------------------ recording */
async function record(b: B, name: string, seconds: number, act: () => Promise<void>, lead = 0.15) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cuadra-${name}-`));
  const frames: { file: string; t: number }[] = [];
  let active = true; // listeners stay registered; a finished clip's one stops here
  const onFrame = (p: any) => {
    if (!active) return;
    const file = path.join(dir, `f${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(p.data, "base64"));
    frames.push({ file, t: p.metadata.timestamp });
    void b.send("Page.screencastFrameAck", { sessionId: p.sessionId });
  };
  b.on("Page.screencastFrame", onFrame);
  await b.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now();
  await act();
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  await b.send("Page.stopScreencast");
  await sleep(200);
  active = false;
  if (frames.length < 2) throw new Error(`${name}: no frames`);
  const start = frames[0].t;
  const lines: string[] = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? start + seconds;
    lines.push(`file '${f.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1)!.file.replace(/\\/g, "/")}'`);
  fs.writeFileSync(path.join(dir, "list.txt"), lines.join("\n") + "\n");
  const out = path.join(CLIPS, `${name}.mp4`);
  execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "medium", out]);
  const size = (await import("node:child_process")).execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path.join(dir, frames[0].file.split(/[\\/]/).pop()!)]).toString().trim();
  fs.rmSync(dir, { recursive: true, force: true });
  const marks = fs.existsSync(path.join(CLIPS, "marks.json")) ? JSON.parse(fs.readFileSync(path.join(CLIPS, "marks.json"), "utf8")) : {};
  marks[name] = lead;
  fs.writeFileSync(path.join(CLIPS, "marks.json"), JSON.stringify(marks, null, 2) + "\n");
  console.log(`${name}: ${frames.length} frames over ${seconds}s (${(frames.length / seconds).toFixed(1)} per second), frame ${size}`);
}

/* ------------------------------------------------------------------ the shots */
async function main() {
  const slides = await serve();
  const b = await launchBrowser(9400 + Math.floor(Math.random() * 400));
  const meat = readJson<RunResult>("public", "runs", "meat-short-weight.json");
  const layout = readJson<any>("public", "paper", "meat-short-weight", "layout.json");
  const px = 1240 / 595; // invoice.png pixels per PDF point
  const cell = (line: string, text: string) => layout.invoice.lines[line].cells.find((c: any[]) => c[0] === text);
  const q13 = cell("13", "6,000 kg");
  const p14 = cell("14", "16,90");

  const slide = async (name: string, file: string, seconds: number, spec: unknown) => {
    await b.send("Page.navigate", { url: `${slides.url}/scripts/video/slides/${file}` });
    await sleep(1200);
    await record(b, name, seconds, async () => {
      await b.evaluate(`window.play(${JSON.stringify(spec)})`);
    });
  };

  const shots: Record<string, () => Promise<void>> = {
    v01: async () => {
      await b.send("Page.navigate", { url: "about:blank" });
      await sleep(300);
      await record(
        b,
        "v01",
        9,
        async () => {
          await b.send("Page.navigate", { url: `${base}/` });
          await sleep(1400);
          await b.evaluate(CURSOR);
          await sleep(2600);
          await point(b, "main a[href='/case/meat-short-weight']");
        },
        0.45,
      );
    },
    v02: () =>
      slide("v02", "doc.html", 7.5, {
        img: "/public/paper/meat-short-weight/chat.png",
        w: 1075,
        h: 1900,
        kind: "phone",
        place: { x: 494, y: 6, s: 0.42 },
        shots: [
          { cx: 537, cy: 950, z: 1 },
          { at: 0.7, dur: 2.4, cx: 560, cy: 1130, z: 1.9 },
        ],
        marks: [
          { at: 3.1, x: 830, y: 1028, w: 150, h: 50 },
          { at: 3.4, x: 250, y: 1084, w: 150, h: 50 },
        ],
        tag: { at: 0.4, html: "<b>The order</b> · the chef's WhatsApp, Tuesday 18:42" },
      }),
    v03: () =>
      slide("v03", "doc.html", 9.5, {
        img: "/public/paper/meat-photo-delivery/delivery.jpg",
        w: 1800,
        h: 1350,
        kind: "photo",
        place: { x: 0, y: -135, s: 0.8 },
        shots: [
          { cx: 900, cy: 675, z: 1 },
          { at: 0.6, dur: 2.6, cx: 1290, cy: 660, z: 2.2 },
          { at: 5.4, dur: 2.4, cx: 1000, cy: 870, z: 1.45 },
        ],
        marks: [{ at: 3.1, x: 1232, y: 588, w: 180, h: 40 }],
        tag: { at: 0.4, html: "<b>The delivery note</b> · a phone photo of the signed paper (synthetic)" },
      }),
    v04: () =>
      slide("v04", "doc.html", 9.5, {
        img: "/public/paper/meat-short-weight/invoice.png",
        w: 1240,
        h: 1754,
        kind: "sheet",
        place: { x: 335, y: 40, s: 0.62 },
        shots: [
          { cx: 620, cy: 560, z: 1 },
          { at: 0.6, dur: 2.4, cx: (q13[1] + 40) * px, cy: ((q13[2] + q13[4]) / 2) * px, z: 2.3 },
          { at: 4.6, dur: 1.8, cx: (p14[1] + 20) * px, cy: ((p14[2] + p14[4]) / 2) * px, z: 2.3 },
        ],
        marks: [
          { at: 2.9, x: q13[1] * px, y: q13[2] * px, w: (q13[3] - q13[1]) * px * 0.62, h: (q13[4] - q13[2]) * px },
          { at: 6.3, x: p14[1] * px, y: p14[2] * px, w: (p14[3] - p14[1]) * px, h: (p14[4] - p14[2]) * px },
        ],
        tag: { at: 0.4, html: "<b>The invoice</b> · the supplier's PDF, page 1" },
      }),
    v05: async () => {
      await goto(b, `${base}/case/meat-short-weight`);
      await record(b, "v05", 12, async () => {
        await sleep(2200);
        await scrollTo(b, 430, 1600, 0);
        await sleep(1200);
        await point(b, "section[aria-label='The documents as they arrived'] li:nth-child(2) button", false, 900);
      });
    },
    v06: async () => {
      await goto(b, `${base}/case/meat-short-weight`);
      await jump(b, "#issues", 110);
      await sleep(900);
      await record(b, "v06", 13, async () => {
        await sleep(500);
        await point(b, "#issues button[title='Show line 13 of the invoice']", true);
        await sleep(4600);
        await jump(b, "#issues", 110);
        await sleep(400);
        await point(b, "#issues button[title='Show line 12 of the delivery note']", true);
      });
    },
    v07: async () => {
      await goto(b, `${base}/case/meat-short-weight`);
      await record(b, "v07", 11.5, async () => {
        await sleep(600);
        await point(b, "section[aria-label='Verdict'] dl", false, 900);
        await sleep(2800);
        await scrollTo(b, "#issues", 1500, 110);
      });
    },
    v08: async () => {
      await goto(b, `${base}/case/meat-photo-delivery`);
      await jump(b, "#documents", 84);
      await sleep(900);
      await tagButton(b, "I checked the photo", "__photo-ok", "#issues");
      await record(b, "v08", 12, async () => {
        await sleep(2400);
        await scrollTo(b, "#__photo-ok", 1300, 380);
        await sleep(300);
        await point(b, "#__photo-ok", true, 900);
        await sleep(1400);
        await scrollTo(b, 0, 1300, 0);
      });
    },
    v09: async () => {
      await goto(b, `${base}/case/fish-bank-change`);
      await record(b, "v09", 7, async () => {
        await sleep(900);
        await point(b, "section[aria-label='Verdict'] h1", false, 900);
      });
    },
    v10: async () => {
      await goto(b, `${base}/case/fish-bank-change`);
      await jump(b, "#issues", 110);
      await sleep(900);
      await record(b, "v10", 14, async () => {
        await sleep(600);
        await point(b, "#issues button[title='Show line 29 of the invoice']", true);
      });
    },
    v11: async () => {
      await goto(b, `${base}/case/meat-short-weight`);
      await jump(b, "#email", 100);
      await sleep(900);
      await record(b, "v11", 10.5, async () => {
        await sleep(2500);
        await scrollTo(b, "#email", 2400, -200);
      });
    },
    v12: async () => {
      const proof = amountProof(meat)!;
      const email = meat.record?.emailToSupplier ?? "";
      await slide("v12", "mcp.html", 12, {
        question: "Check the Gredos meat invoice against the delivery note and the chef's order.",
        decision: "Pay €365.42 now. Claim €42.81 back with a credit note. Check €18.70 with the kitchen first.",
        sources: proof.sources.map((s) => ({ where: `${s.doc}, line ${s.line}`, before: s.before, match: s.match, after: s.after })),
        emailStart: email.split(/\n+/).slice(0, 2).join(" ").slice(0, 210).replace(/\s+\S*$/, "") + " …",
        verdict: meat.record?.emailCheck?.verdict ?? "checked",
      });
    },
    v13: () =>
      slide("v13", "end.html", 9, {
        logo: wordmarkSvg("light"),
        url: "cuadra-alpha-blush.vercel.app",
        facts: ["10 Clocked endpoints", "6 recorded cases", "synthetic documents", "open source, MIT"],
      }),
  };

  const names = only.length ? only : Object.keys(shots);
  for (const n of names) {
    if (!shots[n]) throw new Error(`unknown shot ${n}`);
    await shots[n]();
  }
  b.close();
  slides.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
