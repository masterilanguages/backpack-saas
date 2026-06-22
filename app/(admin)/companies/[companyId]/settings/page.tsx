"use client";

import { useState } from "react";
import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const company = useCompany();

  const [name, setName] = useState(company.name);
  const [tagline, setTagline] = useState(company.tagline);
  const [industry, setIndustry] = useState(company.industry);

  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(
    Object.fromEntries(company.modules.map((m) => [m.id, true]))
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    try {
      localStorage.setItem(
        "masteri-settings",
        JSON.stringify({ name, tagline, industry, enabledModules })
      );
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description={`Workspace configuration for ${company.name}. Changes are saved to local storage.`}
      />

      <div className="space-y-6">
        <Section title="Company profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Company name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tagline</span>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Industry</span>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Currency</span>
              <input
                type="text"
                defaultValue={company.currency}
                readOnly
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              />
            </label>
          </div>
        </Section>

        <Section
          title="Branding"
          description="Used for the company avatar and accent colors across the panel."
        >
          <div className="flex items-center gap-4">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: company.color }}
            >
              {company.initials}
            </span>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Initials</span>
                <input
                  type="text"
                  defaultValue={company.initials}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Accent color</span>
                <input
                  type="text"
                  defaultValue={company.color}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </label>
            </div>
          </div>
        </Section>

        <Section
          title="Modules"
          description="Company-specific modules shown in the sidebar."
        >
          <ul className="divide-y divide-slate-100">
            {company.modules.map((module) => (
              <li key={module.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-slate-800">{module.label}</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabledModules[module.id]}
                  onClick={() =>
                    setEnabledModules((prev) => ({
                      ...prev,
                      [module.id]: !prev[module.id],
                    }))
                  }
                  className={cn(
                    "relative h-6 w-11 rounded-full transition",
                    enabledModules[module.id] ? "bg-indigo-600" : "bg-slate-300"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      enabledModules[module.id] ? "left-[22px]" : "left-0.5"
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Save changes
          </button>
          {saved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
        </div>
      </div>
    </div>
  );
}
