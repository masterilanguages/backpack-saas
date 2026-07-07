"use client";

import { useUI } from "@/lib/i18n/UILanguage";
import { UI_LANGUAGES } from "@/lib/i18n/dictionaries";

export default function SettingsPage() {
  const { lang, setLang, t } = useUI();

  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <div className="mb-8 pt-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {t("settings.title")}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">{t("settings.subtitle")}</p>
      </div>

      {/* Interface language — separate from the learning language (sidebar). */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-base font-semibold text-white">
          🌐 {t("settings.interfaceLanguage")}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {t("settings.interfaceLanguageHint")}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {UI_LANGUAGES.map((l) => {
            const selected = l.id === lang;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                aria-pressed={selected}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                <span className="text-xl">{l.emoji}</span>
                <span
                  className={`flex-1 text-sm font-medium ${
                    selected ? "text-teal-300" : "text-slate-200"
                  }`}
                >
                  {l.label}
                </span>
                {selected && <span className="text-teal-400">✓</span>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
