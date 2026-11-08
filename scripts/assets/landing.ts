/**
 * Small images for the landing page (npm run landing-assets), so the first screen does not download
 * whole-page scans on a phone:
 *   - the three hero strips, cropped exactly where app/page.tsx crops them (same functions, same run),
 *   - lighter copies of the pictures used further down the page.
 * Output: public/paper/landing/*.webp. Cropping and encoding: scripts/assets/crop.py (Pillow).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { heroCrops, landingCuts } from "../../lib/ui/landing";
import { loadLayout, loadRun } from "../../lib/server/data";

const OUT = path.join("public", "paper", "landing");
const run = loadRun("meat-short-weight");
if (!run) throw new Error("public/runs/meat-short-weight.json is missing: run npm run runs first");
const crops = heroCrops(run, loadLayout("meat-short-weight"));
if (!crops) throw new Error("could not locate the solomillo lines in the meat case");

const fish = loadRun("fish-bank-change");
if (!fish) throw new Error("public/runs/fish-bank-change.json is missing");
const cuts = Object.values(landingCuts(run, loadLayout("meat-short-weight"), fish, loadLayout("fish-bank-change")));
if (cuts.some((c) => !c)) throw new Error("could not locate one of the landing cuts");

const jobs = [
  ...cuts.map((c) => ({ src: path.join("public", c!.full), out: path.join("public", c!.src), page: c!.page, region: c!.region, width: c!.width })),
  ...crops.map((c) => ({ src: path.join("public", c.full), out: path.join("public", c.src), page: c.page, region: c.region, width: 600 })),
  ...crops.map((c) => ({ src: path.join("public", c.full), out: path.join("public", c.srcSmall), page: c.page, region: c.region, width: 300 })),
  { src: "public/paper/meat-short-weight/chat.png", out: path.join(OUT, "chat-sm.webp"), width: 420 },
  { src: "public/paper/meat-photo-delivery/delivery.jpg", out: path.join(OUT, "photo-delivery-sm.webp"), width: 760 },
  { src: "public/paper/meat-short-weight/invoice.png", out: path.join(OUT, "invoice-sm.webp"), width: 480 },
  { src: "public/paper/meat-photo-delivery/delivery.jpg", out: path.join(OUT, "photo-delivery.webp"), width: 1400 },
];
fs.mkdirSync(OUT, { recursive: true });
const spec = path.join(OUT, ".jobs.json");
fs.writeFileSync(spec, JSON.stringify(jobs));
try {
  execFileSync("python", [path.join("scripts", "assets", "crop.py"), spec], { stdio: "inherit" });
} finally {
  fs.rmSync(spec, { force: true });
}
