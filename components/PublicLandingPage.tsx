"use client";

import type { LandingPageContent } from "@/lib/landing-page";

export default function PublicLandingPage({ content }: { content: LandingPageContent }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-sm font-bold tracking-tight" style={{ color: content.accentColor }}>
            {content.eyebrow}
          </span>
          <a
            href={content.primaryCtaHref}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: content.accentColor }}
          >
            {content.primaryCtaText}
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p
          className="text-xs font-semibold uppercase tracking-[0.28em]"
          style={{ color: content.accentColor }}
        >
          {content.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{content.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">{content.subheadline}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={content.primaryCtaHref}
            className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: content.accentColor }}
          >
            {content.primaryCtaText}
          </a>
          {content.secondaryCtaText && (
            <a
              href={content.secondaryCtaHref}
              className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {content.secondaryCtaText}
            </a>
          )}
        </div>
      </section>

      <section id="services" className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 sm:grid-cols-3">
          {content.features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div
                className="mb-3 h-1 w-10 rounded-full"
                style={{ backgroundColor: content.accentColor }}
              />
              <h2 className="text-lg font-semibold text-slate-900">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {content.eyebrow}
      </footer>
    </div>
  );
}
