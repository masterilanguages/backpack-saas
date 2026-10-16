/// <reference lib="deno.ns" />

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONJUGATION_SLOTS, hasConjugations, lemmaKey, mergeOccurrence, normalizeBinyan, occurrenceFrom,
  occurrenceKey, parseConjugations, parseVerbAnalysis, plainSpelling, slotFor, stripNikud, MAX_OCCURRENCES,
  type VerbOccurrence,
  keyOfAnalysis, sameVerbLetters,
} from "./verbs.ts";

// The acceptance example of "Verbos en Flashcards": שהנחת → לְהַנִּיחַ.
const SHEHENACHTA = {
  is_verb: true, lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put",
  binyan: "Hif'il", root: "נ-ו-ח", tense: "past", person: 2, gender: "m", number: "sg",
  prefix: "ש", form: "הנחת", phonetic: "shehenachta", translation: "that you put",
};

Deno.test("stripNikud / plainSpelling: no points, no punctuation, lower case", () => {
  assertEquals(stripNikud("לְהַנִּיחַ"), "להניח");
  assertEquals(plainSpelling(" לְהַנִּיחַ, "), "להניח");
  assertEquals(plainSpelling("Comer!"), "comer");
});

Deno.test("normalizeBinyan: spellings of the same binyan agree; unknown → ''", () => {
  for (const b of ["Hif'il", "HIFIL", "hiphil", "hifil"]) assertEquals(normalizeBinyan(b), "hifil");
  assertEquals(normalizeBinyan("Qal"), "paal");
  assertEquals(normalizeBinyan("Hof'al"), "hufal");
  assertEquals(normalizeBinyan("whatever"), "");
  assertEquals(normalizeBinyan(undefined), "");
});

Deno.test("lemmaKey: nikud ignored, no letter dropped, binyan kept apart, empty lemma → ''", () => {
  assertEquals(lemmaKey("לְהַנִּיחַ", "Hif'il"), "להניח|hifil");
  assertEquals(lemmaKey("להניח", "hifil"), lemmaKey("לְהַנִּיחַ", "Hif'il"));
  assert(lemmaKey("לספר", "piel") !== lemmaKey("לספר", "paal"));
  assertEquals(lemmaKey("comer"), "comer");
  assertEquals(lemmaKey("  "), "");
});

// Different verbs that a careless key could merge. Every pair must keep two
// keys. The first group differs only in a vowel letter (ו/י) in the SAME
// binyan: dropping ו/י (the rejected phase 2 key) merged them.
const MUST_STAY_APART: [string, string, string, string][] = [
  ["לָשִׁיר", "paal", "לָשׁוּר", "paal"],      // to sing / to behold
  ["לָגוּר", "paal", "לָגִיר", "paal"],       // to dwell / (to whiten, rare)
  ["לָרִיב", "paal", "לָרוּב", "paal"],       // to quarrel / (to multiply, rare)
  ["לָדוּן", "paal", "לָדִין", "paal"],       // to discuss / (to judge, variant)
  ["לָצוּם", "paal", "לָצִים", "paal"],       // to fast / —
  ["לִלְמוֹד", "paal", "לְלַמֵּד", "piel"],    // to learn / to teach
  ["לִסְפּוֹר", "paal", "לְסַפֵּר", "piel"],   // to count / to tell
  ["לִגְדּוֹל", "paal", "לְגַדֵּל", "piel"],   // to grow / to raise
  ["לִשְׁמוֹר", "paal", "לְשַׁמֵּר", "piel"],  // to keep / to preserve
  ["לַחְשׁוֹב", "paal", "לְחַשֵּׁב", "piel"],  // to think / to calculate
  ["לָקוּם", "paal", "לְקַיֵּים", "piel"],     // to get up / to keep (a promise)
  ["לָשׁוּב", "paal", "לָשֶׁבֶת", "paal"],     // to return / to sit
  ["לָנוּחַ", "paal", "לִנְחוֹת", "paal"],     // to rest / to land
  ["לִהְיוֹת", "paal", "לִחְיוֹת", "paal"],    // to be / to live
  ["לְהָבִין", "hifil", "לְהִתְבּוֹנֵן", "hitpael"], // to understand / to observe
];

Deno.test("no two different verbs share a key (incl. the pairs dropping ו/י would merge)", () => {
  const keys = new Map<string, string>();
  for (const [a, ba, b, bb] of MUST_STAY_APART) {
    const ka = lemmaKey(a, ba), kb = lemmaKey(b, bb);
    assert(ka !== kb, `${a} (${ba}) and ${b} (${bb}) share the key ${ka}`);
    for (const [lemma, k] of [[a, ka], [b, kb]]) {
      if (keys.has(k)) assertEquals(keys.get(k), lemma, `${lemma} collides with ${keys.get(k)} on ${k}`);
      keys.set(k, lemma);
    }
  }
  // The rejected rule (drop ו/י after the first letter) merges the first pairs.
  const dropVowelLetters = (s: string) => { const p = stripNikud(s); return p[0] + p.slice(1).replace(/[וי]/g, ""); };
  assertEquals(dropVowelLetters("לָשִׁיר"), dropVowelLetters("לָשׁוּר"));
});

Deno.test("full and defective spelling: one card through the model's lemma_plain, never by dropping letters", () => {
  const a = parseVerbAnalysis({ is_verb: true, lemma: "לֶאֱהֹב", lemma_plain: "לאהוב", binyan: "paal" }, "hebrew", "אוהבת")!;
  const b = parseVerbAnalysis({ is_verb: true, lemma: "לֶאֱהוֹב", lemma_plain: "לאהוב", binyan: "paal" }, "hebrew", "אהבתי")!;
  assertEquals([keyOfAnalysis(a), keyOfAnalysis(b)], ["לאהוב|paal", "לאהוב|paal"]);
  // Without lemma_plain: the pointed spellings differ, so two cards (never a wrong merge).
  const c = parseVerbAnalysis({ is_verb: true, lemma: "לֶאֱהֹב", binyan: "paal" }, "hebrew", "אוהבת")!;
  assertEquals(keyOfAnalysis(c), "לאהב|paal");
});

Deno.test("lemma_plain is ignored when it is not the same verb's letters (or not plain letters)", () => {
  const p = (lemma_plain: unknown, lemma = "לָשִׁיר") => parseVerbAnalysis({ is_verb: true, lemma, lemma_plain, binyan: "paal" }, "hebrew", "שר")!.lemma_plain;
  assertEquals(p("לשיר"), "לשיר");
  assertEquals(p("לשור"), "לשור");           // same consonants: allowed (the model's call)…
  assertEquals(p("לזמר"), "");               // …another verb: ignored
  assertEquals(p("לָשִׁיר"), "");            // with nikud: ignored
  assertEquals(p("לשיר!"), "");
  assertEquals(p(42), "");
  assert(sameVerbLetters("לאהוב", "לֶאֱהֹב"));
  assert(!sameVerbLetters("לאהוב", "לכתוב"));
});

Deno.test("parseVerbAnalysis: the acceptance example", () => {
  const a = parseVerbAnalysis(SHEHENACHTA, "hebrew", "שהנחת")!;
  assertEquals(a.lemma, "לְהַנִּיחַ");
  assertEquals(a.binyan, "hifil");
  assertEquals([a.tense, a.person, a.gender, a.number], ["past", 2, "m", "sg"]);
  assertEquals([a.prefix, a.form], ["ש", "הנחת"]);
  assertEquals(a.translation, "that you put");
});

Deno.test("parseVerbAnalysis: not a verb or untrustworthy → null (word saved as today)", () => {
  assertEquals(parseVerbAnalysis({ is_verb: false }, "hebrew", "נשמה"), null);
  assertEquals(parseVerbAnalysis(null, "hebrew", "x"), null);
  assertEquals(parseVerbAnalysis("yes", "hebrew", "x"), null);
  assertEquals(parseVerbAnalysis({ is_verb: "true", lemma: "לאכול" }, "hebrew", "אכלתי"), null);
  assertEquals(parseVerbAnalysis({ is_verb: true, lemma: "" }, "hebrew", "אכלתי"), null);
  // A Hebrew word whose "infinitive" came back in Latin letters.
  assertEquals(parseVerbAnalysis({ is_verb: true, lemma: "lehaniach" }, "hebrew", "שהנחת"), null);
});

Deno.test("parseVerbAnalysis: unknown grammar values are dropped, a wrong form falls back to the word", () => {
  const a = parseVerbAnalysis({ ...SHEHENACHTA, tense: "pluperfect", person: 7, gender: "x", number: "dual", form: "משהו אחר" }, "hebrew", "שהנחת")!;
  assertEquals([a.tense, a.person, a.gender, a.number], [null, null, null, null]);
  assertEquals(a.form, "הנחת"); // the word minus its prefix ש
  const b = parseVerbAnalysis({ ...SHEHENACHTA, prefix: "", form: "" }, "hebrew", "שהנחת")!;
  assertEquals(b.form, "שהנחת");
});

Deno.test("occurrence: built from the analysis and the context; key ignores nikud", () => {
  const a = parseVerbAnalysis(SHEHENACHTA, "hebrew", "שהנחת")!;
  const o = occurrenceFrom("שהנחת", a, { sentence: "…שהנחת…", video_id: "vid1", video_title: "Song" });
  assertEquals(o.surface, "שהנחת");
  assertEquals([o.tense, o.person, o.gender, o.number], ["past", 2, "m", "sg"]);
  assertEquals([o.sentence, o.video_id, o.video_title], ["…שהנחת…", "vid1", "Song"]);
  assertEquals(occurrenceKey({ surface: "שֶׁהֵנַחְתָּ", video_id: "vid1" }), occurrenceKey(o));
  assert(occurrenceKey({ surface: "שהנחת", video_id: "vid2" }) !== occurrenceKey(o));
});

Deno.test("mergeOccurrence: idempotent, never mutates, capped", () => {
  const o1: VerbOccurrence = { surface: "שהנחת", video_id: "v1" };
  const o2: VerbOccurrence = { surface: "הנחתי", video_id: "v2" };
  const start: VerbOccurrence[] = [];
  const one = mergeOccurrence(start, o1);
  assertEquals(start.length, 0);
  assertEquals(mergeOccurrence(one, { ...o1 }), one);           // same word, same video
  assertEquals(mergeOccurrence(one, o2).length, 2);
  assertEquals(mergeOccurrence(null, o1), [o1]);
  const full = Array.from({ length: MAX_OCCURRENCES }, (_, i) => ({ surface: `w${i}`, video_id: "v" }));
  assertEquals(mergeOccurrence(full, o2).length, MAX_OCCURRENCES);
});

Deno.test("slotFor: grammar → table cell, including Hebrew present and common plurals", () => {
  assertEquals(slotFor({ tense: "past", person: 2, gender: "m", number: "sg" }), { tense: "past", slot: "2ms" });
  assertEquals(slotFor({ tense: "past", person: 1, gender: null, number: "sg" }), { tense: "past", slot: "1s" });
  assertEquals(slotFor({ tense: "past", person: 2, gender: "f", number: "pl" }), { tense: "past", slot: "2fp" });
  assertEquals(slotFor({ tense: "past", person: 3, gender: "m", number: "pl" }), { tense: "past", slot: "3p" });
  assertEquals(slotFor({ tense: "present", gender: "f", number: "pl" }), { tense: "present", slot: "fp" });
  assertEquals(slotFor({ tense: "future", person: 2, gender: "f", number: "pl" }), { tense: "future", slot: "2p" });
  assertEquals(slotFor({ tense: "future", person: 3, gender: "f", number: "sg" }), { tense: "future", slot: "3fs" });
  assertEquals(slotFor({ tense: "imperative", gender: "f", number: "sg" }), { tense: "imperative", slot: "fs" });
  assertEquals(slotFor({ tense: "imperative", number: "pl" }), { tense: "imperative", slot: "p" });
  // Not enough to place it.
  assertEquals(slotFor({ tense: "infinitive" }), null);
  assertEquals(slotFor({ tense: "present", number: "sg" }), null);
  assertEquals(slotFor({ tense: "past", gender: "m", number: "sg" }), null);
});

Deno.test("hasConjugations: '{}' (the column default) is not a table", () => {
  assertEquals(hasConjugations({}), false);
  assertEquals(hasConjugations(null), false);
  assertEquals(hasConjugations({ past: {} }), false);
  assertEquals(hasConjugations({ past: { i: "  " } }), false);
  assertEquals(hasConjugations({ past: { i: "הנחתי" } }), true);          // old VerbsTab shape
  assertEquals(hasConjugations({ past: { "1s": { he: "הִנַּחְתִּי", phonetic: "hinachti" } } }), true);
});

function fullTable() {
  const t: any = {};
  for (const [tense, slots] of Object.entries(CONJUGATION_SLOTS)) {
    t[tense] = Object.fromEntries(slots.map((s) => [s, { he: `צורה-${tense}-${s}`, phonetic: `${tense}-${s}` }]));
  }
  return t;
}

Deno.test("parseConjugations: keeps known cells only; too incomplete → null (not cached)", () => {
  const full = parseConjugations({ conjugations: { ...fullTable(), pluperfect: { x: { he: "x" } } } })!;
  assertEquals(Object.keys(full).sort(), ["future", "imperative", "past", "present"]);
  assertEquals(full.past!["2ms"], { he: "צורה-past-2ms", phonetic: "past-2ms" });
  const t = fullTable();
  t.past.extra = { he: "x" };
  assertEquals(parseConjugations(t)!.past!.extra, undefined);
  assertEquals(parseConjugations({ conjugations: { past: fullTable().past } }), null);
  assertEquals(parseConjugations(null), null);
  assertEquals(parseConjugations({ conjugations: "nope" }), null);
});
