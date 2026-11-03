/** Money and quantity helpers. All amounts are EUR with two decimals. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Spanish format: 1.234,56 */
export function fmtEs(n: number, decimals = 2): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${grouped}${dec !== undefined ? "," + dec : ""}`;
}

/** English display format for the app: €1,234.56 */
export function eur(n: number): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  const [int, dec] = fixed.split(".");
  return `${neg ? "−" : ""}€${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}

/** Quantity as printed on Spanish documents: weights with 3 decimals, counts as integers. */
export function fmtQtyEs(qty: number, unit: string): string {
  return unit === "kg" ? fmtEs(qty, 3) : Number.isInteger(qty) ? String(qty) : fmtEs(qty, 2);
}

/**
 * Parses a number as written on a document ("1.234,56", "5,200", "15.29", "21 %", "€ 3,60").
 * Returns null when the text holds no unambiguous number.
 */
export function parseDocNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/[€%\s]|EUR|eur/g, "").replace(/[^\d.,\-−]/g, "");
  s = s.replace("−", "-");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // the later separator is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    // "1.234" (thousands) vs "15.29" (decimal): three digits after a single dot = thousands
    const parts = s.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0")) {
      s = s.replace(/\./g, "");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
