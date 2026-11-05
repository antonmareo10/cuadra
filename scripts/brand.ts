/**
 * npm run brand
 *
 * Writes the favicon (public/icon.svg) and the Apple touch icon (public/apple-icon.png, 180×180)
 * from lib/ui/brand.ts, so the logo has a single source. tests/brand.test.ts fails if they drift.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { markSvg } from "../lib/ui/brand";

const pub = path.join(process.cwd(), "public");
fs.writeFileSync(path.join(pub, "icon.svg"), markSvg());
await sharp(Buffer.from(markSvg()), { density: 600 }).resize(180, 180).png().toFile(path.join(pub, "apple-icon.png"));
console.log("wrote public/icon.svg and public/apple-icon.png from lib/ui/brand.ts");
