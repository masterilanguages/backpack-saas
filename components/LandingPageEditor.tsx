"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_LANDING_PAGE,
  loadLandingPage,
  saveLandingPage,
  type LandingPageContent,
} from "@/lib/landing-page";
import PublicLandingPage from "./PublicLandingPage";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", width: "100%" },
  { id: "tablet", label: "Tablet", width: "768px" },
  { id: "mobile", label: "Mobile", width: "390px" },
] as const;

type ViewportId = (typeof VIEWPORTS)[number]["id"];

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const className =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

export default function LandingPageEditor() {
  const [content, setContent] = useState<LandingPageContent>(DEFAULT_LANDING_PAGE);
  const [saved, setSaved] = useState(false);
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const active = VIEWPORTS.find((v) => v.id === viewport)!;

  useEffect(() => {
    setContent(loadLandingPage());
  }, []);

  function update<K extends keyof LandingPageContent>(key: K, value: LandingPageContent[K]) {
    setContent((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function updateFeature(index: number, field: "title" | "description", value: string) {
    setContent((prev) => ({
      ...prev,
      features: prev.features.map((f, i) => (i === index ? { ...f, [field]: value } : f)),
    }));
    setSaved(false);
  }

  function handleSave() {
    saveLandingPage(content);
    setSaved(true);
  }

  function handleReset() {
    setContent(DEFAULT_LANDING_PAGE);
    saveLandingPage(DEFAULT_LANDING_PAGE);
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Page content</h2>
            <p className="text-xs text-slate-500">Edit copy below — preview updates as you type.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Save changes
            </button>
            <a
              href="/website"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Open live ↗
            </a>
          </div>
        </div>
        {saved && (
          <p className="mt-3 text-xs font-medium text-emerald-600">Saved — live page updated.</p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow" value={content.eyebrow} onChange={(v) => update("eyebrow", v)} />
          <Field
            label="Accent color"
            value={content.accentColor}
            onChange={(v) => update("accentColor", v)}
          />
          <div className="sm:col-span-2">
            <Field label="Headline" value={content.headline} onChange={(v) => update("headline", v)} />
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Subheadline"
              value={content.subheadline}
              onChange={(v) => update("subheadline", v)}
              multiline
            />
          </div>
          <Field
            label="Primary CTA text"
            value={content.primaryCtaText}
            onChange={(v) => update("primaryCtaText", v)}
          />
          <Field
            label="Primary CTA link"
            value={content.primaryCtaHref}
            onChange={(v) => update("primaryCtaHref", v)}
          />
          <Field
            label="Secondary CTA text"
            value={content.secondaryCtaText}
            onChange={(v) => update("secondaryCtaText", v)}
          />
          <Field
            label="Secondary CTA link"
            value={content.secondaryCtaHref}
            onChange={(v) => update("secondaryCtaHref", v)}
          />
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Feature cards</p>
          {content.features.map((feature, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2"
            >
              <Field
                label={`Feature ${index + 1} title`}
                value={feature.title}
                onChange={(v) => updateFeature(index, "title", v)}
              />
              <Field
                label={`Feature ${index + 1} description`}
                value={feature.description}
                onChange={(v) => updateFeature(index, "description", v)}
                multiline
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {VIEWPORTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewport(v.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                viewport === v.id ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div
          className="mx-auto overflow-hidden rounded-xl border border-slate-200 bg-slate-200/60 p-3 sm:p-6"
          style={{ maxWidth: active.width }}
        >
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
            <PublicLandingPage content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}
