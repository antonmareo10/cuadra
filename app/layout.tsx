import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE } from "@/lib/site";
import { SmoothScroll } from "./components/SmoothScroll";
import "./globals.css";

// Type, bundled so builds need no network (both SIL Open Font License, see app/fonts/OFL-*.txt):
// Archivo, a grotesque with a width axis: text at normal width, headlines expanded like the header of a printed form.
const archivo = localFont({
  src: "./fonts/Archivo-wdth-wght-latin.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});
// Martian Mono, for every number and quoted line: the till-roll and the stamp.
const mono = localFont({
  src: "./fonts/MartianMono-wdth-wght-latin.woff2",
  variable: "--font-martian",
  weight: "100 800",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "75% 112.5%" }],
});

const description =
  "Take a photo of the delivery note. Cuadra checks it against the chef's order and the supplier's invoice, line by line, and tells a small restaurant what to pay, what to claim back and what not to pay at all. Built on the Clocked API.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: "Cuadra · Pay the right amount, to the right account",
  description,
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/apple-icon.png" },
  openGraph: {
    type: "website",
    siteName: "Cuadra",
    title: "Cuadra · Pay the right amount, to the right account",
    description,
    url: SITE.url,
  },
  twitter: { card: "summary_large_image", title: "Cuadra · Pay the right amount, to the right account", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f2fb8" },
    { media: "(prefers-color-scheme: dark)", color: "#090c24" },
  ],
};

// Applies a stored theme choice before first paint (no flash). Falls back to the system theme.
const themeScript = `try{var t=localStorage.getItem("cuadra-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-3 focus:py-2 focus:text-ink">
          Skip to content
        </a>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
