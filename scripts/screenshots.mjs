// node scripts/screenshots.mjs [baseUrl]
// Takes README screenshots with a headless Chromium browser (Edge or Chrome) against a running
// server (npm run start). Writes docs/screenshots/*.png.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3000";
const candidates = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) {
  console.error("No Chromium-based browser found; set BROWSER=/path/to/chrome");
  process.exit(1);
}
const out = path.join(process.cwd(), "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cuadra-shot-"));

const shots = [
  ["home-1440.png", "/", 1440, 2400],
  ["home-390.png", "/", 390, 2600],
  ["case-meat-1440.png", "/case/meat-short-weight", 1440, 2200],
  ["case-meat-390.png", "/case/meat-short-weight", 390, 2600],
  ["case-fish-1440.png", "/case/fish-bank-change", 1440, 2200],
  ["case-drinks-1440.png", "/case/drinks-vat-return", 1440, 2200],
  ["documents-1440.png", "/case/fish-bank-change#documents", 1440, 1300],
  ["full-meat-1440.png", "/case/meat-short-weight", 1440, 7800],
];

for (const [file, url, w, h] of shots) {
  const target = path.join(out, file);
  execFileSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--user-data-dir=${profile}`,
      `--window-size=${w},${h}`,
      "--virtual-time-budget=6000",
      `--screenshot=${target}`,
      base + url,
    ],
    { stdio: "ignore", timeout: 120000 },
  );
  console.log("saved", path.relative(process.cwd(), target));
}
