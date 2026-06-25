"use client";

import { useParams } from "next/navigation";
import { useSchool } from "@/lib/useSchool";

/**
 * Per-tenant model: one org per subdomain. There is no mock company list to
 * switch between, so this simply surfaces the CURRENT org (name + accent badge)
 * for the active tenant. It renders nothing outside a company context.
 */
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S"
  );
}

const ACCENT_FALLBACK = "#6366f1";

export default function CompanySwitcher() {
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId;
  const { school } = useSchool();

  // Outside a company context there is no active org to show.
  if (!companyId) return null;

  const name = school?.name ?? companyId;
  const accent = school?.accent_color ?? ACCENT_FALLBACK;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white"
        style={{ backgroundColor: accent }}
      >
        {initials(name)}
      </span>
      <span className="hidden max-w-[12rem] truncate sm:block">{name}</span>
    </div>
  );
}
