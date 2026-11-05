import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { markSvg } from "../lib/ui/brand";

describe("the logo has one source", () => {
  it("public/icon.svg is generated from lib/ui/brand.ts (run npm run brand after changing the mark)", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "public", "icon.svg"), "utf8")).toBe(markSvg());
  });
});
