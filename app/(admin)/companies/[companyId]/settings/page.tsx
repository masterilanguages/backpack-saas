"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";

interface School { id: string; slug: string; name: string; tagline?: string; industry?: string; currency: string; accent_color: string; }

export default function SettingsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/school/${companyId}`).then((r) => r.json()).then(setSchool);
  }, [companyId]);

  const handleSave = async () => {
    if (!school) return;
    await fetch(`/api/school/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: school.name, tagline: school.tagline, industry: school.industry }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!school) return null;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description={`Workspace configuration for ${school.name}.`} />
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">School profile</h2>
          </div>
          <div className="p-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Name</span>
              <input type="text" value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Tagline</span>
              <input type="text" value={school.tagline ?? ""} onChange={(e) => setSchool({ ...school, tagline: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Industry</span>
              <input type="text" value={school.industry ?? ""} onChange={(e) => setSchool({ ...school, industry: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Currency</span>
              <input type="text" value={school.currency} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSave} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
            Save changes
          </button>
          {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
