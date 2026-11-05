// node scripts/screenshots-v2.mjs [baseUrl] [outDir]
// v2 screenshots at 1440 and 390 px from a running server (npm run start), plus a quick
// layout check: horizontal overflow and console errors on every page.
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const out = path.resolve(process.argv[3] ?? path.join("docs", "screenshots", "v2"));
fs.mkdirSync(out, { recursive: true });

const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const ALL = [
  ["home", "/"],
  ["case-meat", "/case/meat-short-weight"],
  ["case-photo", "/case/meat-photo-delivery"],
  ["case-fish", "/case/fish-bank-change"],
  ["case-drinks", "/case/drinks-vat-return"],
  ["case-duplicate", "/case/veg-duplicate"],
  ["case-substitution", "/case/clean-substitution"],
  ["assistants", "/assistants"],
  ["check", "/check"],
];
const PAGES = ONLY.length ? ALL.filter(([n]) => ONLY.includes(n)) : ALL;

const b = await launch({ width: 1440, height: 900, port: 9351 });
const errors = [];
b.on("Runtime.exceptionThrown", (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
b.on("Runtime.consoleAPICalled", (p) => {
  if (p.type === "error") errors.push(p.args?.map((a) => a.value ?? a.description).join(" "));
});
const report = [];

async function settle() {
  // Let the reveal-on-scroll sections play: scroll to the bottom in steps, then back to the top.
  await b.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } window.scrollTo(0, 0); })()`);
  await sleep(900);
}

for (const [w, h, mobile, tag] of [
  [1440, 900, false, "1440"],
  [390, 844, true, "390"],
]) {
  await b.setViewport(w, h, mobile);
  for (const [name, url] of PAGES) {
    errors.length = 0;
    await b.goto(base + url, 2200);
    await b.theme("light");
    await b.goto(base + url, 2600);
    await settle();
    const overflow = await b.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    report.push({ page: name, width: tag, overflow, errors: [...errors] });
    await b.screenshot(path.join(out, `${name}-${tag}-fold.png`));
    if (name === "home" || name === "assistants") await b.screenshot(path.join(out, `${name}-${tag}-full.png`), { fullPage: true });
    console.log(`${name} ${tag}: overflow ${overflow}px, ${errors.length} console errors`);
  }
}

// Views that show the v2 features
if (process.env.NO_VIEWS) {
  await b.close();
  process.exit(0);
}
await b.setViewport(1440, 900, false);
await b.goto(base + "/case/meat-short-weight", 2600);
await b.scrollTo("#documents", 10);
await sleep(800);
await b.click("#issues button[title^='Show line']");
await sleep(2400);
await b.screenshot(path.join(out, "views-documents-focus-1440.png"));
await b.goto(base + "/case/meat-photo-delivery", 2600);
await b.scrollTo("#documents", 10);
await sleep(1500);
await b.screenshot(path.join(out, "views-photo-documents-1440.png"));
await b.goto(base + "/case/fish-bank-change", 2600);
await b.scrollTo("#documents", 10);
await sleep(1500);
await b.screenshot(path.join(out, "views-fish-documents-1440.png"));
await b.goto(base + "/", 2600);
await b.theme("dark");
await b.goto(base + "/", 2600);
await settle();
await b.screenshot(path.join(out, "views-home-dark-1440.png"));
await b.theme("light");

fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
await b.close();
process.exit(0);
