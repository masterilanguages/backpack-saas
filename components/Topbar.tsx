"use client";

import { useParams, usePathname } from "next/navigation";
import { useSchool } from "@/lib/useSchool";
import CompanySwitcher from "./CompanySwitcher";
import { MenuIcon } from "./Icons";

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

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const params = useParams<{ companyId?: string }>();
  const pathname = usePathname();
  const companyId = params.companyId;
  // Real org for the active tenant (fetched from /api/school/[companyId]).
  const { school } = useSchool();
  const isControlPanel = pathname === "/";

  const title = companyId
    ? school?.name ?? companyId
    : isControlPanel
    ? "Control Panel"
    : "All Companies";
  const subtitle = companyId
    ? school?.tagline ?? ""
    : isControlPanel
    ? "Backpack"
    : "Portfolio overview";
  // Identidad del usuario logueado (para que el coach/staff sepa que es SU sesión).
  const userDisplay = school?.userName || school?.userEmail || "";
  const avatarInitials = userDisplay ? initials(userDisplay) : "BP";

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
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          {subtitle && (
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <CompanySwitcher />
        {userDisplay && (
          <div className="hidden text-right leading-tight sm:block">
            <p className="max-w-[170px] truncate text-xs font-semibold text-slate-800">
              {school?.userName || school?.userEmail}
            </p>
            {school?.userName && school?.userEmail && (
              <p className="max-w-[170px] truncate text-[11px] text-slate-400">
                {school.userEmail}
              </p>
            )}
          </div>
        )}
        <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 sm:flex">
          {avatarInitials}
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
