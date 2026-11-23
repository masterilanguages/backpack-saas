/// <reference lib="deno.ns" />

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearTranslitCache,
  normalizeHebrewRomanization,
  resolveHebrewTranslit,
  romanizeHebrew,
} from "./hebrewRomanization.ts";
import { HEBREW_TRANSLIT_RULES } from "../chapterPrompts.ts";
import { voiceProfile } from "./voices.ts";

const r = (he: string, expect: string) => {
  clearTranslitCache();
  assertEquals(romanizeHebrew(he), expect, he);
};

Deno.test("vocalized Hebrew matches modern Israeli pronunciation", () => {
  r("שָׁלוֹם", "shalom");
  r("תּוֹדָה", "toda");
  r("בֹּקֶר טוֹב", "boker tov");
  r("אֲנִי", "ani");
  r("סֵפֶר", "sefer");
  r("כֶּלֶב", "kelev");
  r("חָתוּל", "chatul");
  r("לֶאֱהֹב", "le'ehov");
  r("אוֹהֵב", "ohev");
  r("אוֹהֶבֶת", "ohevet");
  r("נִכְנַסְתְּ", "nichnast");
  r("נִכְנֶסֶת", "nichneset");
  r("שַׁבָּת", "shabbat");
  r("חָמֵשׁ", "chamesh");
  r("שָׁעָה", "sha'a");
  r("מֵאָה", "me'a");
  r("יוֹם רְבִיעִי", "yom revi'i");
  r("דֶּצֶמְבֶּר", "detzember");
  r("שְׁתַּיִם", "shtayim");
  r("שְׁנֵים עָשָׂר", "shneim asar");
  r("זְמַן", "zman");
  r("מַיִם", "mayim");
  r("בַּיִת", "bayit");
  r("אֵיךְ", "eich");
  r("בֵּין", "bein");
  r("עַכְשָׁו", "achshav");
  r("אֶתְמוֹל", "etmol");
  r("הַיּוֹם", "hayom");
  r("לִהְיוֹת", "lihyot");
  r("לָלֶכֶת", "lalechet");
  r("לִרְאוֹת", "lir'ot");
  r("לִשְׁמֹעַ", "lishmoa");
  r("לָדַעַת", "lada'at");
  r("לְהַנִּיחַ", "lehaniach");
  r("הִנַּחְתִּי", "hinachti");
  r("הִנַּחְתָּ", "hinachta");
  r("הֵנִיחַ", "heniach");
  r("הֵנִיחָה", "henicha");
  r("מַנִּיחַ", "maniach");
  r("אַנִּיחַ", "aniach");
  r("תַּנִּיחִי", "tanichi");
  r("יַנִּיחוּ", "yanichu");
  r("הַנַּח", "hanach");
  r("הַנִּיחִי", "hanichi");
  r("מַנִּיחִים", "manichim");
  r("מַנִּיחוֹת", "manichot");
  r("הֵעַרְתָּ אֶת הַלֵּב", "he'arta et halev");
  r("צְבָעִים", "tzva'im");
  r("בְּיָם", "beyam");
  r("לִפְנֵי", "lifnei");
  r("אֲנַחְנוּ", "anachnu");
  r("לַעֲשׂוֹת", "la'asot");
  r("אֶרְאֶה", "er'e");
  r("פֶבְרוּאָר", "fevru'ar");
  r("מִשְׁפָּחָה", "mishpacha");
  r("רוּחַ", "ruach");
  r("תַּפּוּחַ", "tapuach");
});

Deno.test("unvocalized text is not letter-guessed", () => {
  assertEquals(romanizeHebrew("שלום"), "");
  assertEquals(romanizeHebrew("נכנסת לחיי"), "");
});

Deno.test("model guesses are normalized onto the Israeli spelling", () => {
  clearTranslitCache();
  assertEquals(normalizeHebrewRomanization("Nikansta lekhayay"), "nikansta lechayay");
  assertEquals(normalizeHebrewRomanization("sha-LOM"), "shalom");
  assertEquals(normalizeHebrewRomanization("Beitzah"), "beitza");
  assertEquals(normalizeHebrewRomanization("detsember"), "detzember");
  assertEquals(normalizeHebrewRomanization("shabbath"), "shabbat");
  assertEquals(normalizeHebrewRomanization("chamésḥ"), "chamesch");
});

Deno.test("vocalized source wins over a bad guess, and the result is cached", () => {
  clearTranslitCache();
  assertEquals(resolveHebrewTranslit("חָמֵשׁ", "chamésḥ"), "chamesh");
  assertEquals(resolveHebrewTranslit("חָמֵשׁ", "something-else"), "chamesh");
  clearTranslitCache();
  assertEquals(resolveHebrewTranslit("שלום", "sha-LOM"), "shalom");
  assertEquals(resolveHebrewTranslit("שלום", "a different guess"), "shalom");
});

Deno.test("the shared prompt no longer teaches the old mistakes", () => {
  assert(!HEBREW_TRANSLIT_RULES.includes("heart et halev"));
  assert(!HEBREW_TRANSLIT_RULES.includes("tzvaim"));
  assert(!/no hyphens or apostrophes/i.test(HEBREW_TRANSLIT_RULES));
  assert(HEBREW_TRANSLIT_RULES.includes("he'arta"));
  assert(HEBREW_TRANSLIT_RULES.includes("tzva'im"));
  assert(HEBREW_TRANSLIT_RULES.includes("nichnast lechayai"));
  assert(HEBREW_TRANSLIT_RULES.includes("chamesh"));
  assert(HEBREW_TRANSLIT_RULES.includes("le'ehov"));
  assert(/modern Israeli/i.test(HEBREW_TRANSLIT_RULES));
});

Deno.test("voice registry: Hebrew is an Israeli he-IL neural voice; other schools' languages resolve too", () => {
  const he = voiceProfile("hebrew");
  assertEquals(he?.locale, "he-IL");
  assertEquals(he?.azure, "he-IL-HilaNeural");
  assertEquals(voiceProfile("he")?.language, "hebrew");
  assertEquals(voiceProfile("iw")?.locale, "he-IL");
  assertEquals(voiceProfile("spanish")?.locale, "es-ES");
  assertEquals(voiceProfile("pt")?.locale, "pt-BR");
  assertEquals(voiceProfile("klingon"), null);
});
