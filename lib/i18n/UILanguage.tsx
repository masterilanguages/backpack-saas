"use client";

// Interface-language context for the student portal.
//
// Holds the current UI language, persists it to localStorage, and exposes a
// `t(key, vars)` helper. This is the INTERFACE language (menus/buttons) — it is
// deliberately independent from the learning language (userProfile.language).
//
// Lookup falls back to English for any missing key, so partially-translated
// screens never render a blank or a raw key.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DICT, type UILang } from "./dictionaries";

type Vars = Record<string, string | number>;
type Ctx = {
  lang: UILang;
  setLang: (l: UILang) => void;
  t: (key: string, vars?: Vars) => string;
};

const UICtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "ui_lang";

function lookup(lang: UILang, key: string): string {
  const walk = (root: any) => {
    let node: any = root;
    for (const part of key.split(".")) node = node?.[part];
    return typeof node === "string" ? node : null;
  };
  return walk(DICT[lang]) ?? walk(DICT.en) ?? key;
}

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

function translate(lang: UILang, key: string, vars?: Vars): string {
  return interpolate(lookup(lang, key), vars);
}

export function UILanguageProvider({ children }: { children: React.ReactNode }) {
  // Start with English on the server/first paint; hydrate from localStorage on
  // the client to avoid a hydration mismatch.
  const [lang, setLangState] = useState<UILang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "es") setLangState(saved);
    } catch {
      /* localStorage unavailable — stay on English */
    }
  }, []);

  const setLang = useCallback((l: UILang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => translate(lang, key, vars),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

// Safe even outside the provider: falls back to English with no persistence, so
// components can call it unconditionally.
export function useUI(): Ctx {
  const ctx = useContext(UICtx);
  if (ctx) return ctx;
  return {
    lang: "en",
    setLang: () => {},
    t: (key: string, vars?: Vars) => translate("en", key, vars),
  };
}
