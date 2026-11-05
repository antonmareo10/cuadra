/**
 * The mark, in ONE place. Everything that shows the logo is drawn from here:
 *   - the header and footer logo (app/components/ui.tsx, <Logo/>)
 *   - the social image (app/opengraph-image.tsx)
 *   - public/icon.svg and public/apple-icon.png (npm run brand writes them; a test checks they match)
 *   - the video slides and the gallery (scripts/video, which read markSvg())
 * To change the logo, change the paths and colours below and run `npm run brand`.
 */

// A receipt with a tick.
export const RECEIPT = "M11 6.5H21A1.5 1.5 0 0 1 22.5 8V25.5L20.33 24L18.17 25.5L16 24L13.83 25.5L11.67 24L9.5 25.5V8A1.5 1.5 0 0 1 11 6.5Z";
export const TICK = "M12.6 16.4l2.5 2.5 4.5-5.2";

export const BRAND = {
  name: "cuadra",
  ink: "#1b1a17",
  paper: "#f5f2ea",
  accent: "#c8432a",
} as const;

/** The mark as a standalone SVG (32×32 viewBox). */
export function markSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="${BRAND.ink}"/>` +
    `<path d="${RECEIPT}" fill="${BRAND.paper}"/>` +
    `<path d="${TICK}" fill="none" stroke="${BRAND.accent}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}
