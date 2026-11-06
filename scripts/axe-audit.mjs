// node scripts/axe-audit.mjs [baseUrl] [out.json]
// Runs axe-core (WCAG 2.1 A and AA plus best practices) on every page at 1440 and 390 px, light and dark,
// after letting the scroll reveals play. Needs .clocked/axe.min.js (axe-core 4.10.2; the script downloads it
// from cdnjs the first time). Exits 1 if any violation is found.
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? path.join("docs", "screenshots", "v2", "axe.json");
const axeFile = path.join(".clocked", "axe.min.js");
if (!fs.existsSync(axeFile)) {
  fs.mkdirSync(".clocked", { recursive: true });
  const r = await fetch("https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js");
  fs.writeFileSync(axeFile, await r.text());
}
const axe = fs.readFileSync(axeFile, "utf8");
const PAGES = ["/", "/case/meat-short-weight", "/case/meat-photo-delivery", "/case/fish-bank-change", "/case/drinks-vat-return", "/case/veg-duplicate", "/case/clean-substitution", "/assistants", "/check", "/no-such-page"];
const b = await launch({ width: 1440, height: 900, port: 9500 + Math.floor(Math.random() * 300) });
const results = [];
let total = 0;
for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
  await b.setViewport(w, h, mobile);
  for (const theme of ["light", "dark"]) {
    for (const p of PAGES) {
      await b.goto(base + p, 1500);
      await b.theme(theme);
      await b.goto(base + p, 2200);
      await b.evaluate(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } window.scrollTo(0, 0); })()`);
      await sleep(1200);
      await b.evaluate(axe);
      const v = await b.evaluate(`axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }).then(r => r.violations.map(x => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length, sample: x.nodes.slice(0, 3).map(n => n.target.join(" ")) })))`);
      total += v.length;
      results.push({ page: p, width: w, theme, violations: v });
      console.log(`${String(w).padEnd(4)} ${theme.padEnd(5)} ${p.padEnd(28)} ${v.length ? v.map((x) => `${x.id}(${x.nodes})`).join(", ") : "0"}`);
    }
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ base, axe: "4.10.2", results }, null, 2) + "\n");
await b.close();
console.log(`${total} violations in ${results.length} page views`);
process.exit(total ? 1 : 0);
