"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { getCompany } from "@/lib/companies";
import type { IconName } from "@/lib/types";
import { Icon, CloseIcon } from "./Icons";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

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
  const company = params.companyId ? getCompany(params.companyId) : undefined;

  const globalNav: NavItem[] = [
    { href: "/", label: "Control Panel", icon: "dashboard" },
    { href: "/dashboard", label: "Overview", icon: "dashboard" },
    { href: "/companies", label: "Companies", icon: "building" },
  ];

  const base = company ? `/companies/${company.id}` : "";
  const companyNav: NavItem[] = company
    ? [
        { href: `${base}/dashboard`, label: "Dashboard", icon: "dashboard" },
        { href: `${base}/leads`, label: company.labels.leads, icon: "leads" },
        { href: `${base}/clients`, label: company.labels.clients, icon: "clients" },
        { href: `${base}/projects`, label: company.labels.projects, icon: "projects" },
        { href: `${base}/tasks`, label: company.labels.tasks, icon: "tasks" },
        { href: `${base}/calendar`, label: "Calendar", icon: "calendar" },
        { href: `${base}/notes`, label: "Notes", icon: "notes" },
        { href: `${base}/files`, label: "Files", icon: "files" },
        { href: `${base}/team`, label: company.labels.team, icon: "team" },
        { href: `${base}/finances`, label: "Finances", icon: "finances" },
        { href: `${base}/newsletter`, label: "Newsletter", icon: "email" },
      ]
    : [];

  const moduleNav: NavItem[] = company
    ? company.modules.map((m) => ({
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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
              L
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">
              Masteri
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
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              General
            </p>
            <div className="space-y-0.5">
              {globalNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>

          {company && (
            <>
              <div>
                <p className="mb-2 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: company.color }}
                  />
                  {company.name}
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
          {company ? (
            <Link
              href={`/companies/${company.id}/settings`}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(`/companies/${company.id}/settings`)
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              )}
            >
              <Icon name="settings" className="h-[18px] w-[18px]" />
              Settings
            </Link>
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500">
              Select a company to manage it
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
