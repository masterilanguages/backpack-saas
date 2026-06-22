import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
