"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useSchool } from "@/lib/useSchool";
import type { IconName } from "@/lib/types";
import { Icon, CloseIcon } from "./Icons";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Default section labels for a language school (per-tenant, no mock data). */
const NAV_LABELS = {
  leads: "Leads",
  clients: "Students",
  projects: "Lessons",
  tasks: "Homework & Tasks",
  team: "Coaches",
} as const;

/** Default sidebar modules. */
const NAV_MODULES: { id: string; label: string }[] = [
  { id: "curriculum", label: "Curriculum" },
  { id: "vocabulary", label: "Vocabulary" },
  { id: "mnemonics", label: "Mnemonics" },
  { id: "progress", label: "Progress" },
  { id: "landing-page", label: "Website" },
];

const ACCENT_FALLBACK = "#6366f1";

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-white/10 text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
      )}
    >
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId;
  // Real org for the active tenant (fetched from /api/school/[companyId]).
  const { school } = useSchool();
  // Vista por rol: el coach ve una versión acotada (centrada en alumnos).
  const isCoach = school?.role === "coach";

  const schoolName = school?.name ?? companyId ?? "School";
  const accent = school?.accent_color ?? ACCENT_FALLBACK;
  const brandInitial = schoolName.trim().charAt(0).toUpperCase() || "B";

  const base = companyId ? `/companies/${companyId}` : "";
  // Secciones que un coach NO ve (admin/owner): ventas, gestión de equipo,
  // dinero y comunicación masiva. El coach queda centrado en sus alumnos.
  const COACH_HIDDEN = new Set(["leads", "team", "finances", "newsletter"]);
  const allCompanyNav: { key: string; href: string; label: string; icon: IconName }[] = companyId
    ? [
        { key: "dashboard", href: `${base}/dashboard`, label: "Dashboard", icon: "dashboard" },
        { key: "leads", href: `${base}/leads`, label: NAV_LABELS.leads, icon: "leads" },
        { key: "clients", href: `${base}/clients`, label: NAV_LABELS.clients, icon: "clients" },
        { key: "projects", href: `${base}/projects`, label: NAV_LABELS.projects, icon: "projects" },
        { key: "tasks", href: `${base}/tasks`, label: NAV_LABELS.tasks, icon: "tasks" },
        { key: "calendar", href: `${base}/calendar`, label: "Calendar", icon: "calendar" },
        { key: "notes", href: `${base}/notes`, label: "Notes", icon: "notes" },
        { key: "files", href: `${base}/files`, label: "Files", icon: "files" },
        { key: "team", href: `${base}/team`, label: NAV_LABELS.team, icon: "team" },
        { key: "finances", href: `${base}/finances`, label: "Finances", icon: "finances" },
        { key: "newsletter", href: `${base}/newsletter`, label: "Newsletter", icon: "email" },
      ]
    : [];
  const companyNav: NavItem[] = allCompanyNav
    .filter((i) => !isCoach || !COACH_HIDDEN.has(i.key))
    .map(({ key: _key, ...item }) => item);

  // El coach solo ve módulos de aprendizaje (Vocabulary, Progress).
  const COACH_MODULES = new Set(["vocabulary", "progress"]);
  const moduleNav: NavItem[] = companyId
    ? NAV_MODULES.filter((m) => !isCoach || COACH_MODULES.has(m.id)).map((m) => ({
        href: `${base}/modules/${m.id}`,
        label: m.label,
        icon: "module" as IconName,
      }))
    : [];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {brandInitial}
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-white">
              {companyId ? schoolName : "Backpack"}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {companyId && (
            <>
              <div>
                <p className="mb-2 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="truncate">{schoolName}</span>
                </p>
                <div className="space-y-0.5">
                  {companyNav.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Modules
                </p>
                <div className="space-y-0.5">
                  {moduleNav.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </nav>

        <div className="shrink-0 border-t border-white/10 px-3 py-3">
          {companyId && !isCoach ? (
            <Link
              href={`/companies/${companyId}/settings`}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(`/companies/${companyId}/settings`)
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              )}
            >
              <Icon name="settings" className="h-[18px] w-[18px]" />
              Settings
            </Link>
          ) : !companyId ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              Select a company to manage it
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
