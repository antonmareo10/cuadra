import { describe, expect, it } from "vitest";
import { fmtEs, parseDocNumber, round2 } from "../lib/money";
import { blankRanges, cpToUtf16, findCp, sliceCp } from "../lib/engine/text";

describe("numbers as printed on Spanish documents", () => {
  it.each([
    ["1.234,56 €", 1234.56],
    ["5,200 kg", 5.2],
    ["28,90", 28.9],
    ["10%", 10],
    ["15.29", 15.29],
    ["2 cajas", 2],
    ["", null],
    ["kg", null],
  ])("%s → %s", (raw, expected) => expect(parseDocNumber(raw)).toBe(expected));

  it("formats and rounds money", () => {
    expect(fmtEs(1234.5)).toBe("1.234,50");
    expect(round2(21.6 * 0.11)).toBe(2.38);
  });
});

describe("Clocked offsets are Unicode code points", () => {
  const text = "Hecho 👍\nSi me llamas, mejor al 612 000 004.";

  it("slices by code point, not UTF-16 unit", () => {
    const span = findCp(text, "612 000 004")!;
    expect(span.start).toBe(31); // "Hecho 👍\n" is 8 code points, then 23 characters
    expect(sliceCp(text, span.start, span.end)).toBe("612 000 004");
    const toU = cpToUtf16(text);
    expect(text.slice(toU(span.start), toU(span.end))).toBe("612 000 004");
    // The emoji is one code point but two UTF-16 units.
    expect(toU(span.start)).toBe(span.start + 1);
  });

  it("blanks whole lines without moving any offset", () => {
    const blanked = blankRanges(text, [{ start: 2, end: 4 }]);
    expect(Array.from(blanked).length).toBe(Array.from(text).length);
    expect(blanked.split("\n")[0].trim()).toBe("");
    expect(blanked.split("\n")[1]).toBe(text.split("\n")[1]);
  });
});
