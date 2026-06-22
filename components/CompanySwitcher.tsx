"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { COMPANY_LIST, getCompany } from "@/lib/companies";
import { ChevronDownIcon, CheckIcon } from "./Icons";
import { cn } from "@/lib/utils";

/** Sections that exist for every company and can be preserved when switching */
const SHARED_SECTIONS = new Set([
  "dashboard",
  "leads",
  "clients",
  "projects",
  "tasks",
  "calendar",
  "notes",
  "files",
  "team",
  "finances",
  "settings",
]);

export default function CompanySwitcher() {
  const params = useParams<{ companyId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = params.companyId ? getCompany(params.companyId) : undefined;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function switchTo(companyId: string) {
    setOpen(false);
    const match = pathname.match(/^\/companies\/[^/]+\/([^/]+)/);
    const section = match && SHARED_SECTIONS.has(match[1]) ? match[1] : "dashboard";
    router.push(`/companies/${companyId}/${section}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        {active ? (
          <>
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white"
              style={{ backgroundColor: active.color }}
            >
              {active.initials}
            </span>
            <span className="hidden sm:block">{active.name}</span>
          </>
        ) : (
          <span className="text-slate-500">Select company</span>
        )}
        <ChevronDownIcon className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Switch company
          </p>
          {COMPANY_LIST.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => switchTo(company.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50",
                active?.id === company.id && "bg-slate-50"
              )}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: company.color }}
              >
                {company.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {company.name}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {company.tagline}
                </span>
              </span>
              {active?.id === company.id && (
                <CheckIcon className="h-4 w-4 shrink-0 text-indigo-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
