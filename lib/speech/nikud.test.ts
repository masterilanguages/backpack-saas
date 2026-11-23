/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stripNikud, pointHebrew } from "./nikud.ts";
import { normalizeHebrewRomanization, romanizeHebrew } from "./hebrewRomanization.ts";

function vocalizeHebrew(hebrew: string, transliteration: string): string | null {
  const pointed = pointHebrew(hebrew, transliteration);
  if (!pointed) return null;
  const back = romanizeHebrew(pointed);
  const want = normalizeHebrewRomanization(transliteration);
  if (!back || back !== want) return null;
  return pointed;
}

Deno.test("nikud round-trips to the Israeli transliteration and strips cleanly", () => {
  const pairs: Array<[string, string]> = [
    ["שלום", "shalom"],
    ["תודה", "toda"],
    ["אני", "ani"],
    ["כלב", "kelev"],
    ["לחם", "lechem"],
    ["בית", "bayit"],
    ["חמש", "chamesh"],
    ["אהבה", "ahava"],
    ["לאהוב", "le'ehov"],
    ["נשמה", "neshama"],
    ["שתיים", "shtayim"],
    ["בקר טוב", "boker tov"],
  ];
  for (const [he, latin] of pairs) {
    const pointed = vocalizeHebrew(he, latin);
    assertEquals(pointed != null, true, he);
    assertEquals(romanizeHebrew(pointed || ""), latin, pointed || "");
    assertEquals(stripNikud(pointed || "").replace(/[^\u05D0-\u05EA]/g, ""), he.replace(/[^\u05D0-\u05EA]/g, ""));
    assertEquals(/[\u0591-\u05C7]/.test(stripNikud(pointed || "")), false);
  }
});

Deno.test("a transliteration that does not match the letters is refused", () => {
  assertEquals(pointHebrew("שלום", "toda"), null);
  assertEquals(vocalizeHebrew("שלום", "toda"), null);
});
