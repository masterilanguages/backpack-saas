/// <reference lib="deno.ns" />
// The two video → Backpack save paths with a fake model and a fake database.
// Run: deno test --unstable-sloppy-imports lib/videoWordSave.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearVerbAnalysisCache, type SaveWordDeps } from "./saveWord.ts";
import { savePopupWord, saveRecommendedWords } from "./videoWordSave.ts";
import { mergeOccurrence } from "./verbs.ts";

const VIDEO = { video_id: "vid-1", title: "Song 1" };
const VIDEO2 = { video_id: "vid-2", title: "Song 2" };
const S1 = "ולפני שהנחת את הספר";
const norm = (t: string) => String(t || "").replace(/[֑-ׇ]/g, "").replace(/[.,!?״"']/g, "").trim();

const VERBS: Record<string, any> = {
  "שהנחת": { is_verb: true, lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put", binyan: "hifil", tense: "past", person: 2, gender: "m", number: "sg", prefix: "ש", form: "הנחת", phonetic: "shehenachta", translation: "that you put" },
  "הנחתי": { is_verb: true, lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put", binyan: "hifil", tense: "past", person: 1, number: "sg", form: "הנחתי", phonetic: "hinachti", translation: "I put" },
  "אוהבת": { is_verb: true, lemma: "לֶאֱהֹב", lemma_phonetic: "le'ehov", lemma_meaning: "to love", binyan: "paal", tense: "present", gender: "f", number: "sg", form: "אוהבת", phonetic: "ohevet", translation: "loves" },
};

/** Fake model: single questions name the word in quotes; batches number them. */
function fakes(opts: { failBatch?: boolean; dropBatchItem?: string; failCreateFor?: string } = {}) {
  const calls = { single: [] as string[], batch: [] as string[], created: [] as any[], verbs: [] as any[] };
  const cards = new Map<string, any>();
  const deps: SaveWordDeps = {
    async createWord(row) {
      if (opts.failCreateFor && row.word === opts.failCreateFor) throw new Error("insert failed");
      calls.created.push(row);
      return { id: `w${calls.created.length}`, ...row };
    },
    async saveVerbOccurrence(card, occ) {
      calls.verbs.push({ card, occ });
      const prev = cards.get(card.lemma_key);
      const row = prev ? { ...prev, verb_forms: mergeOccurrence(prev.verb_forms, occ) } : { id: `v${cards.size + 1}`, ...card, verb_forms: [occ] };
      cards.set(card.lemma_key, row);
      return { word: row, created: !prev };
    },
    async analyze(prompt) {
      if (prompt.startsWith("For each numbered")) {
        calls.batch.push(prompt);
        if (opts.failBatch) throw new Error("overloaded");
        const items = [...prompt.matchAll(/^(\d+)\. "(.+?)" in:/gm)]
          .filter((m) => m[2] !== opts.dropBatchItem)
          .map((m) => ({ i: Number(m[1]), ...(VERBS[m[2]] || { is_verb: false }) }));
        return { items };
      }
      const word = Object.keys(VERBS).find((w) => prompt.includes(`look at the word "${w}"`));
      calls.single.push(word || prompt.match(/look at the word "(.+?)"/)?.[1] || "?");
      return word ? VERBS[word] : { is_verb: false };
    },
    label: (l) => l.charAt(0).toUpperCase() + l.slice(1),
    translitRules: () => "",
    log: () => {},
  };
  return { deps, calls, cards };
}

const ON = { enabledLanguages: ["hebrew"], timeoutMs: 1_000 };
const OFF = { enabledLanguages: [] as string[] };
function test(name: string, fn: () => Promise<void>) {
  Deno.test(name, async () => { clearVerbAnalysisCache(); await fn(); });
}

// ============================================================ savePopupWord

/** Exactly what home/page.tsx savePopupWord created before phase 2. */
const legacyPopupRow = (clean: string, translation: string, phonetic: string, sentence: string, video = VIDEO) => ({
  word: clean, translation: translation || "", phonetic: phonetic || clean, category: "wordbank", language: "hebrew",
  times_practiced: 0, mastered: false, example_sentence: sentence,
  source_video_id: video?.video_id || null, source_video_title: video?.title || null, learn_status: "new",
});

test("popup · flag off: the same row as before, no AI call (verb or not)", async () => {
  const { deps, calls } = fakes();
  for (const [clean, tr, ph] of [["שהנחת", "that you put", "shehenachta"], ["נשמה", "soul", ""]]) {
    await savePopupWord({ clean, translation: tr, phonetic: ph, sentence: S1 }, { language: "hebrew", video: VIDEO, words: [] }, deps, OFF);
  }
  assertEquals(calls.created, [legacyPopupRow("שהנחת", "that you put", "shehenachta", S1), legacyPopupRow("נשמה", "soul", "", S1)]);
  assertEquals(calls.single.length + calls.batch.length + calls.verbs.length, 0);
});

test("popup · flag on, a noun: the same row as before (one analysis call)", async () => {
  const { deps, calls } = fakes();
  const out = await savePopupWord({ clean: "נשמה", translation: "soul", phonetic: "neshama", sentence: "יש נשמה" }, { language: "hebrew", video: VIDEO, words: [] }, deps, ON);
  assertEquals(out.outcome, "not-verb");
  assertEquals(calls.created, [legacyPopupRow("נשמה", "soul", "neshama", "יש נשמה")]);
  assertEquals(calls.single.length, 1);
});

test("popup · flag on, a conjugated verb: the infinitive's card, keeping the form, sentence and video", async () => {
  const { deps, calls } = fakes();
  const out = await savePopupWord({ clean: "שהנחת", translation: "that you put (popup)", phonetic: "shehenachta", sentence: S1 }, { language: "hebrew", video: VIDEO, words: [] }, deps, ON);
  assertEquals(out.outcome, "verb-created");
  assertEquals(calls.created.length, 0);
  const { card, occ } = calls.verbs[0];
  assertEquals([card.word, card.phonetic, card.translation, card.lemma_key, card.learn_status], ["לְהַנִּיחַ", "lehaniach", "to put", "להנח|hifil", "new"]);
  assertEquals([occ.surface, occ.sentence, occ.video_id, occ.video_title, occ.tense, occ.person], ["שהנחת", S1, "vid-1", "Song 1", "past", 2]);
});

test("popup · the same form in another song: no AI call, joins the card with that song's sentence", async () => {
  const { deps, calls, cards } = fakes();
  await savePopupWord({ clean: "שהנחת", translation: "that you put", sentence: S1 }, { language: "hebrew", video: VIDEO, words: [] }, deps, ON);
  const myWords = [...cards.values()];
  const out = await savePopupWord({ clean: "שֶׁהֵנַחְתָּ", translation: "that you left", sentence: "שהנחת לי" }, { language: "hebrew", video: VIDEO2, words: myWords }, deps, ON);
  assertEquals([out.outcome, out.aiCalls, calls.single.length], ["verb-merged", 0, 1]);
  const forms = cards.get("להנח|hifil").verb_forms;
  assertEquals(forms.map((f: any) => [f.video_id, f.sentence]), [["vid-1", S1], ["vid-2", "שהנחת לי"]]);
  assertEquals(forms[1].translation, "that you left"); // this sentence's meaning, not the old one
});

// ===================================================== saveRecommendedWords

const SEGMENTS = [{ hebrew: S1 }, { hebrew: "את אוהבת אותי" }, { text: "יש נשמה בעולם" }];
const RECOMMENDED = [
  { hebrew: "שהנחת", phonetic: "shehenachta", meaning: "that you put" },
  { hebrew: "אוהבת", phonetic: "ohevet", meaning: "loves" },
  { hebrew: "נשמה", phonetic: "neshama", meaning: "soul" },
  { hebrew: "ספר", phonetic: "", meaning: "" },        // no phonetic / meaning
  { hebrew: "נשמה", phonetic: "neshama", meaning: "soul" }, // listed twice
  { hebrew: "", meaning: "empty" },                    // no word
  { hebrew: "שלום", meaning: "hello" },                // already in the Backpack
];
const HAVE = [{ word: "שָׁלוֹם", phonetic: "shalom" }];

/** Exactly what home/page.tsx finishDiscovery created before phase 2. */
function legacyRecommendedRows() {
  const have = new Set(HAVE.map((w) => norm(w.word)));
  const rows: any[] = [];
  for (const r of RECOMMENDED) {
    const key = norm(r.hebrew || "");
    if (!key || have.has(key)) continue;
    have.add(key);
    const sentence = SEGMENTS.find((sg: any) => norm(sg.hebrew || sg.text || "").includes(key)) as any;
    rows.push({
      word: r.hebrew, phonetic: r.phonetic || r.hebrew, translation: r.meaning || "", category: "wordbank", language: "hebrew",
      times_practiced: 0, mastered: false, example_sentence: sentence ? sentence.hebrew || sentence.text : null,
      source_video_id: "vid-1", source_video_title: "Song 1", learn_status: "new",
    });
  }
  return rows;
}
const ctx = (words: any[] = HAVE) => ({ recommended: RECOMMENDED, words, segments: SEGMENTS, language: "hebrew", video: VIDEO, norm });

test("recommended · flag off: the same rows as before, in order, no AI call", async () => {
  const { deps, calls } = fakes();
  const out = await saveRecommendedWords(ctx(), deps, OFF);
  assertEquals(calls.created, legacyRecommendedRows());
  assertEquals([out.added, out.aiCalls, calls.batch.length + calls.single.length], [4, 0, 0]);
});

test("recommended · flag on: ONE call for the whole lesson; verbs become cards, the rest as before", async () => {
  const { deps, calls, cards } = fakes();
  const out = await saveRecommendedWords(ctx(), deps, ON);
  assertEquals([out.added, out.aiCalls, calls.batch.length, calls.single.length], [4, 1, 1, 0]);
  for (const w of ["שהנחת", "אוהבת", "נשמה", "ספר"]) assert(calls.batch[0].includes(`"${w}"`));
  assert(!calls.batch[0].includes(`"שלום"`));
  const legacy = legacyRecommendedRows();
  assertEquals(calls.created, legacy.filter((r) => r.word === "נשמה" || r.word === "ספר"));
  assertEquals([...cards.keys()].sort(), ["לאהב|paal", "להנח|hifil"]);
  assertEquals(cards.get("להנח|hifil").verb_forms[0].sentence, S1);
});

test("recommended · the batch fails: one call only, every word saved as before", async () => {
  const { deps, calls } = fakes({ failBatch: true });
  const out = await saveRecommendedWords(ctx(), deps, ON);
  assertEquals([out.added, out.aiCalls, calls.single.length], [4, 1, 0]);
  assertEquals(calls.created, legacyRecommendedRows());
});

test("recommended · a word the model skipped is saved as before, without a second call", async () => {
  const { deps, calls } = fakes({ dropBatchItem: "אוהבת" });
  await saveRecommendedWords(ctx(), deps, ON);
  assertEquals([calls.batch.length, calls.single.length], [1, 0]);
  assert(calls.created.some((r) => r.word === "אוהבת"));
});

test("recommended · forms already on the student's cards are not sent to the model", async () => {
  const { deps, calls } = fakes();
  const verbCard = { word: "לְהַנִּיחַ", phonetic: "lehaniach", translation: "to put", lemma_key: "להנח|hifil", verb_forms: [{ surface: "שהנחת", tense: "past", person: 2, gender: "m", number: "sg", video_id: "vid-0" }] };
  await saveRecommendedWords(ctx([...HAVE, verbCard]), deps, ON);
  assert(!calls.batch[0].includes(`"שהנחת"`));
  const onlyKnown = { ...ctx([verbCard]), recommended: [RECOMMENDED[0]] };
  const again = await saveRecommendedWords(onlyKnown, deps, ON);
  assertEquals([again.aiCalls, calls.batch.length], [0, 1]);
});

test("recommended · then tapping one of those words in the same sentence costs no call", async () => {
  const { deps, calls } = fakes();
  await saveRecommendedWords(ctx(), deps, ON);
  const out = await savePopupWord({ clean: "אוהבת", translation: "loves", sentence: "את אוהבת אותי" }, { language: "hebrew", video: VIDEO, words: [] }, deps, ON);
  assertEquals([out.aiCalls, calls.single.length], [0, 0]);
});

test("recommended · a failed insert skips that word, as before", async () => {
  for (const opts of [OFF, ON]) {
    clearVerbAnalysisCache();
    const { deps, calls } = fakes({ failCreateFor: "נשמה" });
    const out = await saveRecommendedWords(ctx(), deps, opts);
    assertEquals(out.added, 3);
    assert(!calls.created.some((r) => r.word === "נשמה"));
  }
});
