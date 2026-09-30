import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

// Design fonts of the student screens (display titles + body), exposed as CSS
// variables so a screen opts in with [font-family:var(--font-display)] / (--font-body).
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display", display: "swap" });
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
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
