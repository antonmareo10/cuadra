import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { SITE } from "@/lib/site";
import { SmoothScroll } from "./components/SmoothScroll";
import "./globals.css";

const description =
  "Cuadra checks a restaurant's supplier invoices against the chef's order and the signed delivery note, and says what to pay, what to claim back and which invoices to hold. Every finding points to the line it was printed on. Built on the Clocked API.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: "Cuadra · Pay the right amount, to the right account",
  description,
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
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
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
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
