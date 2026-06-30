"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface School {
  id: string; slug: string; name: string; tagline?: string;
  industry?: string; currency: string; accent_color: string; plan: string;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function CompaniesPage() {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    fetch("/api/platform/schools")
      .then((r) => r.json())
      .then((d) => setSchools(Array.isArray(d) ? d : []))
      .catch(() => setSchools([]));
  }, []);

  return (
    <div>
      <PageHeader title="Schools" description="All schools on Backpack." />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {schools.map((school) => (
          <div key={school.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="h-2" style={{ backgroundColor: school.accent_color }} />
            <div className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: school.accent_color }}>
                  {initials(school.name)}
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{school.name}</h2>
                  <p className="text-xs text-slate-500">{school.industry} · {school.currency} · {school.plan}</p>
                </div>
              </div>
              {school.tagline && <p className="mt-3 text-sm text-slate-600">{school.tagline}</p>}
              <div className="mt-4 flex gap-2">
                <Link href={`/companies/${school.slug}/dashboard`} className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-slate-700">
                  Dashboard
                </Link>
                <Link href={`/companies/${school.slug}/settings`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Settings
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
