"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "@/lib/i18n/UILanguage";
import { UI_LANGUAGES } from "@/lib/i18n/dictionaries";

// Switches the INTERFACE language (menus/buttons) — separate from the learning
// language. A globe icon distinguishes it from the flag-based learning switcher.
export default function InterfaceLanguageSwitcher() {
  const { lang, setLang, t } = useUI();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = UI_LANGUAGES.find((l) => l.id === lang) ?? UI_LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t("ui.interface")}
      >
        <span className="text-base">🌐</span>
        <span className="flex-1 text-left">{current.label}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl"
        >
          {UI_LANGUAGES.map((l) => {
            const selected = l.id === lang;
            return (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition ${
                  selected
                    ? "bg-teal-500/10 text-teal-400"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-base">{l.emoji}</span>
                <span className="flex-1 text-left">{l.label}</span>
                {selected && <span className="text-teal-400">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
