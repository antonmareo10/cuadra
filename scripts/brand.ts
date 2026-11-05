/**
 * npm run brand
 *
 * Writes the favicon (public/icon.svg), the Apple touch icon (public/apple-icon.png, 180×180) and a
 * 512 px app icon (public/icon-512.png) from lib/ui/brand.ts, so the logo has a single source.
 * tests/brand.test.ts fails if public/icon.svg drifts from it.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { appIconSvg, faviconSvg } from "../lib/ui/brand";

const pub = path.join(process.cwd(), "public");
fs.writeFileSync(path.join(pub, "icon.svg"), faviconSvg());
for (const [file, size] of [["apple-icon.png", 180], ["icon-512.png", 512]] as const) {
  await sharp(Buffer.from(appIconSvg()), { density: 1200 }).resize(size, size).png().toFile(path.join(pub, file));
}
console.log("wrote public/icon.svg, public/apple-icon.png and public/icon-512.png from lib/ui/brand.ts");
