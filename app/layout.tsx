import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, Noto_Sans_Hebrew } from "next/font/google";
import "./globals.css";

// Design fonts of the student screens (display titles + body), exposed as CSS
// variables so a screen opts in with [font-family:var(--font-display)] / (--font-body).
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display", display: "swap" });
// Standard print Hebrew. It also has Latin letters, so it goes AFTER the design
// fonts in a stack (they have no Hebrew, so Hebrew falls through to it).
// No generated fallback face: it would cover Latin letters too and win over
// the design fonts that follow it in the stack.
const hebrew = Noto_Sans_Hebrew({ subsets: ["hebrew"], weight: ["400", "500", "600", "700", "800"], variable: "--font-hebrew", display: "swap", adjustFontFallback: false, fallback: [] });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], style: ["normal", "italic"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Masteri Languages",
  description: "1-on-1 language coaching — admin panel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hebrew.variable}`}>
      <body className="bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
