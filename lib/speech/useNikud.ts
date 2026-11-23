"use client";

// Shared nikkud preference for every school. "auto" is the first visit
// (Hebrew is shown as stored). After a tap, "on" or "off" is remembered on
// this device and applied wherever the transliteration view is open.

import { useEffect, useState } from "react";
import {
  NIKUD_PREFERENCE_KEY,
  hasNikud,
  readNikudCache,
  stripNikud,
  writeNikudCache,
} from "./nikud";
import { vocalizeHebrew } from "./index";

export type NikudMode = "auto" | "on" | "off";

export function readNikudMode(): NikudMode {
  if (typeof window === "undefined") return "auto";
  try {
    const v = localStorage.getItem(NIKUD_PREFERENCE_KEY);
    if (v === "1") return "on";
    if (v === "0") return "off";
  } catch { /* ignore */ }
  return "auto";
}

export function useNikudPreference(): [NikudMode, (mode: NikudMode) => void] {
  const [mode, setMode] = useState<NikudMode>("auto");
  useEffect(() => { setMode(readNikudMode()); }, []);
  useEffect(() => {
    const sync = () => setMode(readNikudMode());
    window.addEventListener("backpack-nikud", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("backpack-nikud", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = (next: NikudMode) => {
    setMode(next);
    try {
      if (next === "auto") localStorage.removeItem(NIKUD_PREFERENCE_KEY);
      else localStorage.setItem(NIKUD_PREFERENCE_KEY, next === "on" ? "1" : "0");
    } catch { /* ignore */ }
    window.dispatchEvent(new Event("backpack-nikud"));
  };
  return [mode, update];
}

const letters = (s: string) => stripNikud(s).replace(/[^\u05D0-\u05EA]/g, "");

async function askModel(hebrew: string, transliteration: string): Promise<string | null> {
  const { invokeQuality } = await import("@/lib/invokeQuality");
  const result = await invokeQuality({
    prompt: `Add modern Israeli nikud (vowel points) to this Hebrew so a reader pronounces it exactly as the transliteration. Keep every Hebrew letter the same — do not add, drop, or reorder letters. Only add nikud, dagesh, and shin/sin dots. No Ashkenazi or Biblical vowels.
Hebrew: ${hebrew}
Transliteration: ${transliteration}
Return JSON {"hebrew":"the pointed text"}.`,
    response_json_schema: { type: "object", properties: { hebrew: { type: "string" } } },
  });
  const got = String((result as { hebrew?: string })?.hebrew || "").trim();
  if (!got || letters(got) !== letters(hebrew)) return null;
  return got;
}

/**
 * Hebrew to display. `active` is the transliteration view: outside it, the
 * stored text is left alone. Inside it, the last choice adds or strips nikud.
 */
export function usePointedHebrew(text: string, transliteration: string | undefined, active: boolean): { text: string; loading: boolean } {
  const [mode] = useNikudPreference();
  const [ai, setAi] = useState<string | null>(null);
  const source = String(text || "");
  const latin = String(transliteration || "");
  const plain = stripNikud(source);

  useEffect(() => {
    if (!active || mode !== "on" || !latin) return;
    if (vocalizeHebrew(plain, latin) || readNikudCache(plain, latin)) return;
    let cancel = false;
    askModel(plain, latin).then((got) => {
      if (cancel || !got) return;
      writeNikudCache(plain, latin, got);
      setAi(got);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [plain, latin, active, mode]);

  if (!active || mode === "auto") return { text: source, loading: false };
  if (mode === "off") return { text: stripNikud(source), loading: false };
  const local = latin ? (vocalizeHebrew(plain, latin) || readNikudCache(plain, latin)) : null;
  if (local) return { text: local, loading: false };
  if (ai && letters(ai) === letters(plain)) return { text: ai, loading: false };
  if (hasNikud(source)) return { text: source, loading: false };
  return { text: source, loading: !!latin };
}
