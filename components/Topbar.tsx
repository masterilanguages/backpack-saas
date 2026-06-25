"use client";

import { useParams, usePathname } from "next/navigation";
import { getCompany } from "@/lib/companies";
import CompanySwitcher from "./CompanySwitcher";
import { MenuIcon } from "./Icons";

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const params = useParams<{ companyId?: string }>();
  const pathname = usePathname();
  const company = params.companyId ? getCompany(params.companyId) : undefined;
  const isControlPanel = pathname === "/";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <MenuIcon />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {company ? company.name : isControlPanel ? "Control Panel" : "All Companies"}
          </p>
          <p className="hidden truncate text-xs text-slate-500 sm:block">
            {company ? company.tagline : isControlPanel ? "Masteri Languages" : "Portfolio overview"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <CompanySwitcher />
        <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 sm:flex">
          ML
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
