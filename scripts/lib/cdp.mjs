// Minimal DevTools-protocol driver for a headless Chromium browser (Edge or Chrome).
// Used by the screenshot and video scripts; no dependencies beyond Node 22+ (global WebSocket).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findBrowser() {
  const p = [
    process.env.BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("No Chromium-based browser found; set BROWSER=/path/to/chrome");
  return p;
}

export async function launch({ width = 1440, height = 900, port = 9333 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cuadra-cdp-"));
  const proc = spawn(findBrowser(), [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ], { stdio: "ignore" });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
      if (r.ok) target = await r.json();
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error("browser did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? msg.error);
      pending.delete(msg.id);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  });
  const send = (method, params = {}) => {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise((r) => pending.set(msgId, r));
  };
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;

  await send("Page.enable");
  await send("Runtime.enable");
  const setViewport = (w, h, mobile = false) =>
    send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await setViewport(width, height);

  return {
    send,
    on,
    evaluate,
    setViewport,
    async goto(url, wait = 2500) {
      await send("Page.navigate", { url });
      await sleep(wait);
    },
    async theme(t) {
      await evaluate(`localStorage.setItem("cuadra-theme", ${JSON.stringify(t)}); document.documentElement.dataset.theme = ${JSON.stringify(t)}; true`);
    },
    async scrollTo(selectorOrY, ms = 1200) {
      await evaluate(`(() => {
        const t = ${typeof selectorOrY === "number" ? selectorOrY : `document.querySelector(${JSON.stringify(selectorOrY)})`};
        if (t === null) return;
        const y = typeof t === "number" ? t : t.getBoundingClientRect().top + window.scrollY - 84;
        const y0 = window.scrollY, dy = y - y0, d = ${ms}, s = performance.now();
        return new Promise(res => { const step = now => { const k = Math.min(1, (now - s) / d); const e = 1 - Math.pow(1 - k, 3); window.scrollTo(0, y0 + dy * e); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
      })()`);
      await sleep(250);
    },
    async click(selector) {
      return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
    },
    async screenshot(file, { fullPage = false } = {}) {
      let clip;
      if (fullPage) {
        const h = await evaluate("document.documentElement.scrollHeight");
        const w = await evaluate("document.documentElement.clientWidth");
        clip = { x: 0, y: 0, width: w, height: h, scale: 1 };
      }
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) });
      fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    async close() {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      proc.kill();
    },
  };
}
