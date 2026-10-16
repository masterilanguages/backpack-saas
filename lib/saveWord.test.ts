/// <reference lib="deno.ns" />
// lib/saveWord with fake dependencies: no network, no paid calls.
// Run: deno test --unstable-sloppy-imports lib/saveWord.test.ts

import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearVerbAnalysisCache, saveWordToBackpack, type SaveWordDeps, type VerbCardFields, type WordRow } from "./saveWord.ts";
import { VERB_ANALYSIS_SCHEMA, mergeOccurrence, type VerbOccurrence } from "./verbs.ts";

const SENTENCE = "ולפני שהנחת את הספר על השולחן";
const VERB = {
  is_verb: true, lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put",
  binyan: "hifil", root: "נ-ו-ח", tense: "past", person: 2, gender: "m", number: "sg",
  prefix: "ש", form: "הנחת", phonetic: "shehenachta", translation: "that you put",
};

/** The row savePopupWord (home) builds today. */
const popupRow = (word: string, extra: Partial<WordRow> = {}): WordRow => ({
  word, translation: "ctx", phonetic: "ctx-ph", category: "wordbank", language: "hebrew",
  times_practiced: 0, mastered: false, example_sentence: SENTENCE,
  source_video_id: "vid-1", source_video_title: "Song 1", learn_status: "new", ...extra,
});

function fakes(answers: Record<string, any | Error> = {}, opts: { delayMs?: number } = {}) {
  const calls = { analyze: [] as { prompt: string; schema: any }[], created: [] as WordRow[], verbs: [] as { card: VerbCardFields; occ: VerbOccurrence }[] };
  const cards = new Map<string, any>();
  const deps: SaveWordDeps = {
    async createWord(row) { calls.created.push(row); return { id: `w${calls.created.length}`, ...row }; },
    async saveVerbOccurrence(card, occ) {
      calls.verbs.push({ card, occ });
      const prev = cards.get(card.lemma_key);
      const row = prev ? { ...prev, verb_forms: mergeOccurrence(prev.verb_forms, occ) } : { id: `v${cards.size + 1}`, ...card, verb_forms: [occ] };
      cards.set(card.lemma_key, row);
      return { word: row, created: !prev };
    },
    async analyze(prompt, schema) {
      calls.analyze.push({ prompt, schema });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const word = Object.keys(answers).find((w) => prompt.includes(`"${w}"`));
      const a = word ? answers[word] : { is_verb: false };
      if (a instanceof Error) throw a;
      return a;
    },
    label: (l) => l.charAt(0).toUpperCase() + l.slice(1),
    translitRules: () => "\n[TRANSLIT RULES]",
  };
  return { deps, calls, cards };
}

const ON = { enabledLanguages: ["hebrew"], timeoutMs: 1_000 };
const OFF = { enabledLanguages: [] as string[] };

function test(name: string, fn: () => Promise<void>) {
  Deno.test(name, async () => { clearVerbAnalysisCache(); await fn(); });
}

// --------------------------------------------------- the current flow is kept

test("flag off: the exact same row is created, no AI call", async () => {
  const { deps, calls } = fakes({ "שהנחת": VERB });
  const row = popupRow("שהנחת");
  const out = await saveWordToBackpack({ row }, deps, OFF);
  assertEquals(out.outcome, "plain");
  assertStrictEquals(calls.created[0], row);
  assertEquals(calls.analyze.length + calls.verbs.length, 0);
});

test("a language that is not enabled is saved as today", async () => {
  const { deps, calls } = fakes();
  const row = popupRow("comí", { language: "spanish" });
  assertEquals((await saveWordToBackpack({ row }, deps, ON)).outcome, "plain");
  assertStrictEquals(calls.created[0], row);
  assertEquals(calls.analyze.length, 0);
});

test("fixed vocabulary lists (skipAnalysis) are never analyzed", async () => {
  const { deps, calls } = fakes();
  const row = popupRow("אדום");
  assertEquals((await saveWordToBackpack({ row, skipAnalysis: true }, deps, ON)).outcome, "plain");
  assertStrictEquals(calls.created[0], row);
  assertEquals(calls.analyze.length, 0);
});

test("a noun already known not to be a verb: same row, no AI call", async () => {
  const { deps, calls } = fakes();
  const row = popupRow("נשמה");
  const out = await saveWordToBackpack({ row, knownAnalysis: { is_verb: false } }, deps, ON);
  assertEquals([out.outcome, out.aiCalls], ["not-verb", 0]);
  assertStrictEquals(calls.created[0], row);
  assertEquals(calls.analyze.length + calls.verbs.length, 0);
});

test("a noun with no known analysis: one call, then the same row; the next save of it costs nothing", async () => {
  const { deps, calls } = fakes();
  const row = popupRow("נשמה");
  const out = await saveWordToBackpack({ row }, deps, ON);
  assertEquals([out.outcome, out.aiCalls], ["not-verb", 1]);
  assertStrictEquals(calls.created[0], row);
  const again = await saveWordToBackpack({ row: popupRow("נשמה") }, deps, ON);
  assertEquals([again.outcome, again.aiCalls, calls.analyze.length], ["not-verb", 0, 1]);
});

test("an answer that can't be trusted is treated as not a verb", async () => {
  const { deps, calls } = fakes({ "שהנחת": { is_verb: true, lemma: "" } });
  const row = popupRow("שהנחת");
  assertEquals((await saveWordToBackpack({ row }, deps, ON)).outcome, "not-verb");
  assertStrictEquals(calls.created[0], row);
});

test("AI error: the word is saved as today, and the failure is not remembered", async () => {
  const { deps, calls } = fakes({ "שהנחת": new Error("overloaded") });
  const row = popupRow("שהנחת");
  assertEquals((await saveWordToBackpack({ row }, deps, ON)).outcome, "analysis-failed");
  assertStrictEquals(calls.created[0], row);
  await saveWordToBackpack({ row: popupRow("שהנחת") }, deps, ON);
  assertEquals(calls.analyze.length, 2);
});

test("AI too slow: the word is saved as today after the timeout", async () => {
  const { deps, calls } = fakes({ "שהנחת": VERB }, { delayMs: 300 });
  const row = popupRow("שהנחת");
  const out = await saveWordToBackpack({ row }, deps, { enabledLanguages: ["hebrew"], timeoutMs: 30 });
  assertEquals(out.outcome, "analysis-failed");
  assertStrictEquals(calls.created[0], row);
  await new Promise((r) => setTimeout(r, 320)); // let the late answer settle
});

// ------------------------------------------------------------------- verbs

test("שהנחת → one card לְהַנִּיחַ keeping the original word, sentence, video and grammar", async () => {
  const { deps, calls } = fakes({ "שהנחת": VERB });
  const out = await saveWordToBackpack({ row: popupRow("שהנחת") }, deps, ON);
  assertEquals([out.outcome, out.aiCalls], ["verb-created", 1]);
  assertEquals(calls.created.length, 0);
  const { card, occ } = calls.verbs[0];
  assertEquals(card, {
    word: "לְהַנִּיחַ", phonetic: "lehaniach", translation: "to put", language: "hebrew", lemma_key: "להניח|hifil",
    category: "wordbank", learn_status: "new", times_practiced: 0, mastered: false, image_url: null, mnemonic_explanation: null,
  });
  assertEquals(occ, {
    surface: "שהנחת", prefix: "ש", form: "הנחת", phonetic: "shehenachta", translation: "that you put",
    tense: "past", person: 2, gender: "m", number: "sg",
    sentence: SENTENCE, video_id: "vid-1", video_title: "Song 1",
  });
});

test("the AI question carries the word, its sentence and the transliteration rules", async () => {
  const { deps, calls } = fakes({ "שהנחת": VERB });
  await saveWordToBackpack({ row: popupRow("שהנחת") }, deps, ON);
  const { prompt, schema } = calls.analyze[0];
  assert(prompt.includes(`"${SENTENCE}"`) && prompt.includes(`"שהנחת"`) && prompt.includes("[TRANSLIT RULES]"));
  assertStrictEquals(schema, VERB_ANALYSIS_SCHEMA);
});

test("an analysis the caller already has (chapter gloss / popup) costs no call", async () => {
  const { deps, calls } = fakes();
  const out = await saveWordToBackpack({ row: popupRow("שהנחת"), knownAnalysis: VERB }, deps, ON);
  assertEquals([out.outcome, out.aiCalls, calls.analyze.length], ["verb-created", 0, 0]);
});

test("two saves of the same word at once share one AI call", async () => {
  const { deps, calls } = fakes({ "שהנחת": VERB }, { delayMs: 30 });
  const [a, b] = await Promise.all([
    saveWordToBackpack({ row: popupRow("שהנחת") }, deps, ON),
    saveWordToBackpack({ row: popupRow("שהנחת") }, deps, ON),
  ]);
  assertEquals(calls.analyze.length, 1);
  assertEquals([a.aiCalls + b.aiCalls, a.analysis?.lemma, b.analysis?.lemma], [1, "לְהַנִּיחַ", "לְהַנִּיחַ"]);
});

test("the same verb from a second song joins the first card", async () => {
  const other = { ...VERB, tense: "past", person: 1, gender: null, number: "sg", prefix: "", form: "הנחתי", phonetic: "hinachti", translation: "I put" };
  const { deps, cards } = fakes({ "שהנחת": VERB, "הנחתי": other });
  const first = await saveWordToBackpack({ row: popupRow("שהנחת") }, deps, ON);
  const second = await saveWordToBackpack({ row: popupRow("הנחתי", { source_video_id: "vid-2", source_video_title: "Song 2", example_sentence: "הנחתי לך" }) }, deps, ON);
  assertEquals([first.outcome, second.outcome], ["verb-created", "verb-merged"]);
  assertEquals(cards.size, 1);
  const forms = cards.get("להניח|hifil").verb_forms;
  assertEquals(forms.map((f: any) => [f.surface, f.video_id, f.sentence]), [["שהנחת", "vid-1", SENTENCE], ["הנחתי", "vid-2", "הנחתי לך"]]);
});

test("without a contextual translation in the analysis, the caller's one is kept on the form", async () => {
  const { deps, calls } = fakes({ "שהנחת": { ...VERB, translation: "", phonetic: "" } });
  await saveWordToBackpack({ row: popupRow("שהנחת", { translation: "that you put (popup)", phonetic: "shehenachta" }) }, deps, ON);
  assertEquals([calls.verbs[0].occ.translation, calls.verbs[0].occ.phonetic], ["that you put (popup)", "shehenachta"]);
});
