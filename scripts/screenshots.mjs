// node scripts/screenshots.mjs [baseUrl]
// README screenshots from a running server (npm run start), with animations allowed to finish.
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const out = path.join(process.cwd(), "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });
const b = await launch({ width: 1440, height: 900 });
const save = (name, opts) => b.screenshot(path.join(out, name), opts).then(() => console.log("saved", name));

// Desktop, light theme
await b.goto(base + "/");
await b.theme("light");
await b.goto(base + "/", 3500);
await save("home-1440.png");
await b.scrollTo("#cases", 10);
await sleep(1500);
await save("cases-1440.png");

await b.goto(base + "/case/meat-short-weight", 3500);
await save("case-meat-1440.png");
await b.scrollTo("#issues", 10);
await sleep(1500);
await save("issues-meat-1440.png");
await b.scrollTo("#lines", 10);
await sleep(1500);
await save("lines-meat-1440.png");
await b.scrollTo("#issues", 10);
await b.click("#issues button[title='Show in the document']");
await sleep(2000);
await save("documents-1440.png");
await b.scrollTo("#email", 10);
await sleep(1500);
await save("email-meat-1440.png");

await b.goto(base + "/case/fish-bank-change", 3500);
await save("case-fish-1440.png");
await b.scrollTo("#safety", 10);
await sleep(1500);
await save("safety-fish-1440.png");

await b.goto(base + "/check", 3000);
await save("check-1440.png");

// Dark theme
await b.theme("dark");
await b.goto(base + "/case/drinks-vat-return", 3500);
await save("case-drinks-dark-1440.png");

// Mobile
await b.theme("light");
await b.setViewport(390, 844, true);
await b.goto(base + "/", 3500);
await save("home-390.png");
await b.goto(base + "/case/meat-short-weight", 3500);
await save("case-meat-390.png");
await b.scrollTo("#issues", 10);
await sleep(1500);
await save("issues-meat-390.png");
const overflow = await b.evaluate("document.documentElement.scrollWidth - window.innerWidth");
console.log("horizontal overflow at 390px:", overflow, "px");
await b.close();
process.exit(0);
