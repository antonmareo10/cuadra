/**
 * The logo, in ONE place: direction B, «Doble raya» (competiciones/_marca/cuadra/MARCA.md).
 * The double rule an accountant draws under a total that balances, under the «c» of cuadra.
 * Everything that shows the logo is drawn from here:
 *   - the header and footer wordmark (app/components/ui.tsx, <Logo/>)
 *   - the social image (app/opengraph-image.tsx)
 *   - public/icon.svg and public/apple-icon.png (npm run brand writes them; tests/brand.test.ts checks they match)
 *   - the video title cards (scripts/video), which read wordmarkSvg()
 * To change the logo, change the shapes and colours below and run `npm run brand`.
 */

export const BRAND = {
  name: "cuadra",
  ink: "#1b1a17",
  inkDark: "#f2eee5",
  accent: "#c8432a",
  accentDark: "#f0694b",
  paper: "#f5f2ea",
  paperDark: "#121210",
} as const;

/** The mark (32×32): the «c» and the two rules under it. */
export const MARK = {
  c: "M25.432 8A9.5 9.5 0 1 0 25.432 15H19.011A4.25 4.25 0 1 1 19.011 8Z",
  rules: [
    [4, 23.5, 24, 2.5],
    [4, 27.5, 24, 2.5],
  ],
} as const;

/** The favicon: the same proportions, full bleed, edges on whole pixels at 16 px. */
export const FAVICON = {
  c: "M26.947 7A11 11 0 1 0 26.947 15H19.7A5 5 0 1 1 19.7 7Z",
  rules: [
    [2, 26, 28, 2],
    [2, 30, 28, 2],
  ],
} as const;

/** The wordmark: «cuadra» in Geist SemiBold, outlined, underlined twice. Drawn in a 315.5 × 100.4 box. */
export const WORDMARK = {
  viewBox: "0 0 315.5 100.4",
  transform: "translate(-3.9 71) scale(1.0)",
  letters: "M30.2 1.2Q22.2 1.2 16.3 -2.25Q10.4 -5.7 7.15 -12Q3.9 -18.3 3.9 -26.7Q3.9 -35.1 7.15 -41.4Q10.4 -47.7 16.3 -51.15Q22.2 -54.6 30.2 -54.6Q40.4 -54.6 47.15 -49.3Q53.9 -44 55.1 -34.5L41.9 -33.8Q41.1 -38.9 37.95 -41.55Q34.8 -44.2 30.2 -44.2Q24 -44.2 20.6 -39.6Q17.2 -35 17.2 -26.7Q17.2 -18.4 20.6 -13.8Q24 -9.2 30.2 -9.2Q34.9 -9.2 38.05 -11.9Q41.2 -14.6 41.9 -20.3L55.1 -19.7Q54 -10.1 47.25 -4.45Q40.5 1.2 30.2 1.2ZM79.4 1.2Q71.2 1.2 66.5 -4.1Q61.8 -9.4 61.8 -19V-53.4H74.6V-22.2Q74.6 -15.4 76.85 -12.3Q79.1 -9.2 83.7 -9.2Q88.8 -9.2 91.7 -12.65Q94.6 -16.1 94.6 -22.7V-53.4H107.4V0H95.7L95.5 -8.7Q91.3 1.2 79.4 1.2ZM134.8 1.2Q126.4 1.2 121.3 -2.6Q116.2 -6.4 116.2 -13.4Q116.2 -20.3 120.5 -24.2Q124.8 -28.1 133.6 -29.8L151.3 -33.3Q151.3 -44.7 141 -44.7Q136.4 -44.7 133.7 -42.55Q131 -40.4 130.1 -36.4L117.1 -37Q118.7 -45.4 124.9 -50Q131.1 -54.6 141 -54.6Q152.4 -54.6 158.25 -48.85Q164.1 -43.1 164.1 -32.4V-13Q164.1 -10.9 164.85 -10.1Q165.6 -9.3 167.1 -9.3H168.8V0Q167.1 0.4 164.1 0.4Q159.8 0.4 156.8 -1.4Q153.8 -3.2 153 -8.1V-8.2Q151 -4 146.15 -1.4Q141.3 1.2 134.8 1.2ZM137.4 -8.1Q143.8 -8.1 147.55 -11.8Q151.3 -15.5 151.3 -21.6V-24.6L137.5 -21.8Q133.2 -20.9 131.35 -19.15Q129.5 -17.4 129.5 -14.6Q129.5 -8.1 137.4 -8.1ZM193.3 1.2Q186.5 1.2 181.55 -2.2Q176.6 -5.6 173.9 -11.85Q171.2 -18.1 171.2 -26.7Q171.2 -35.2 173.95 -41.5Q176.7 -47.8 181.65 -51.2Q186.6 -54.6 193.3 -54.6Q198.9 -54.6 203.15 -52.3Q207.4 -50 209.6 -45.8V-71H222.4V0H210.2L209.9 -7.9Q207.7 -3.6 203.3 -1.2Q198.9 1.2 193.3 1.2ZM197.2 -9.2Q203.1 -9.2 206.35 -13.75Q209.6 -18.3 209.6 -26.7Q209.6 -35.2 206.4 -39.7Q203.2 -44.2 197.2 -44.2Q191.4 -44.2 187.95 -39.55Q184.5 -34.9 184.5 -26.7Q184.5 -18.7 187.95 -13.95Q191.4 -9.2 197.2 -9.2ZM234.8 0V-53.4H246.8L247.1 -43Q248.7 -48.4 251.8 -50.9Q254.9 -53.4 259.9 -53.4H264.8V-42.4H259.8Q253.7 -42.4 250.65 -39.65Q247.6 -36.9 247.6 -30.8V0ZM285.4 1.2Q277 1.2 271.9 -2.6Q266.8 -6.4 266.8 -13.4Q266.8 -20.3 271.1 -24.2Q275.4 -28.1 284.2 -29.8L301.9 -33.3Q301.9 -44.7 291.6 -44.7Q287 -44.7 284.3 -42.55Q281.6 -40.4 280.7 -36.4L267.7 -37Q269.3 -45.4 275.5 -50Q281.7 -54.6 291.6 -54.6Q303 -54.6 308.85 -48.85Q314.7 -43.1 314.7 -32.4V-13Q314.7 -10.9 315.45 -10.1Q316.2 -9.3 317.7 -9.3H319.4V0Q317.7 0.4 314.7 0.4Q310.4 0.4 307.4 -1.4Q304.4 -3.2 303.6 -8.1V-8.2Q301.6 -4 296.75 -1.4Q291.9 1.2 285.4 1.2ZM288 -8.1Q294.4 -8.1 298.15 -11.8Q301.9 -15.5 301.9 -21.6V-24.6L288.1 -21.8Q283.8 -20.9 281.95 -19.15Q280.1 -17.4 280.1 -14.6Q280.1 -8.1 288 -8.1Z",
  rules: ["M3.9 14h315.5v5.4h-315.5z", "M3.9 24h315.5v5.4h-315.5z"],
} as const;

const rect = (r: readonly number[], attrs: string) => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" ${attrs}/>`;

/** public/icon.svg: switches to the dark colours on its own in a dark browser tab. */
export function faviconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<style>.fA{fill:${BRAND.accent}}.fP{fill:${BRAND.ink}}@media (prefers-color-scheme:dark){.fA{fill:${BRAND.accentDark}}.fP{fill:${BRAND.inkDark}}}</style>` +
    `<path d="${FAVICON.c}" class="fP"/>` +
    FAVICON.rules.map((r) => rect(r, 'class="fA"')).join("") +
    `</svg>`
  );
}

/** The app icon (Apple touch icon, 512 px icon): the reversed mark on an ink tile. */
export function appIconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${BRAND.ink}"/>` +
    `<g transform="translate(5.76 5.8) scale(0.638)">` +
    `<path d="${MARK.c}" fill="${BRAND.inkDark}"/>` +
    MARK.rules.map((r) => rect(r, `fill="${BRAND.accentDark}"`)).join("") +
    `</g></svg>`
  );
}

/** The wordmark as a standalone SVG, for light ("light") or dark ("dark") backgrounds. */
export function wordmarkSvg(on: "light" | "dark" = "light"): string {
  const ink = on === "light" ? BRAND.ink : BRAND.inkDark;
  const accent = on === "light" ? BRAND.accent : BRAND.accentDark;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK.viewBox}" role="img" aria-label="Cuadra"><title>Cuadra</title>` +
    `<g transform="${WORDMARK.transform}"><path d="${WORDMARK.letters}" fill="${ink}"/>` +
    WORDMARK.rules.map((d) => `<path d="${d}" fill="${accent}"/>`).join("") +
    `</g></svg>`
  );
}
