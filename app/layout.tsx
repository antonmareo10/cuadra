import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { SITE } from "@/lib/site";
import { SmoothScroll } from "./components/SmoothScroll";
import "./globals.css";

// Headlines: Instrument Serif (SIL Open Font License, app/fonts/OFL-InstrumentSerif.txt), bundled so builds need no network.
const display = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
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
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

// Applies a stored theme choice before first paint (no flash). Falls back to the system theme.
const themeScript = `try{var t=localStorage.getItem("cuadra-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
