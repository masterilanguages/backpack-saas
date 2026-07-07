"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { useUI } from "@/lib/i18n/UILanguage";

const NAV = [
  { href: "/home",               key: "dashboard", emoji: "🏠" },
  { href: "/learn/lessons/days", key: "schedule",  emoji: "🗓️" },
  { href: "/learn/lessons",      key: "lessons",   emoji: "📖" },
  { href: "/practice",           key: "practice",  emoji: "🗣️" },
  { href: "/library",            key: "backpack",  emoji: "🎒" },
  { href: "/journal",            key: "journal",   emoji: "📓" },
  { href: "/media",              key: "library",   emoji: "📺" },
  { href: "/progress",           key: "progress",  emoji: "📈" },
];

export default function StudentSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { t } = useUI();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 border-r border-slate-800 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center border-b border-slate-800 px-5">
          <Link href="/home" onClick={onClose} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold text-white">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight text-white">
              Masteri Languages
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-teal-500/10 text-teal-400"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                <span className="text-base">{item.emoji}</span>
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Learning language, settings, sign out footer */}
        <div className="shrink-0 space-y-0.5 border-t border-slate-800 px-3 py-3">
          <LanguageSwitcher />
          <Link
            href="/settings"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              pathname === "/settings"
                ? "bg-teal-500/10 text-teal-400"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
            }`}
          >
            <span className="text-base">⚙️</span>
            <span>{t("nav.settings")}</span>
          </Link>
          <button
            type="button"
            onClick={() => { onClose(); logout(); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            <span className="text-base">🚪</span>
            <span>{t("nav.signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
