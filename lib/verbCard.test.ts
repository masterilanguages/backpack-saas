/// <reference lib="deno.ns" />
// Run: deno test --unstable-sloppy-imports lib/verbCard.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  conjugationRequest, deckSentence, deckVideoTitle, grammarChips, hasSavedWord, highlightParts, isVerbCard,
  knownAnalysisFromCards, otherOccurrences, pickOccurrence, seenSlots, verbForms, wordVideoIds,
} from "./verbCard.ts";

const F1 = { surface: "שהנחת", tense: "past", person: 2, gender: "m", number: "sg", sentence: "ולפני שהנחת את הספר", video_id: "v1", video_title: "Song 1", added_at: "2026-10-16T10:00:00Z", phonetic: "shehenachta", translation: "that you put", prefix: "ש", form: "הנחת" } as any;
const F2 = { surface: "הנחתי", tense: "past", person: 1, number: "sg", sentence: "הנחתי לך", video_id: "v2", video_title: "Song 2", added_at: "2026-10-16T12:00:00Z" } as any;
const F3 = { surface: "תניח", tense: "future", person: 2, gender: "m", number: "sg", sentence: "תניח לי", video_id: "v1", video_title: "Song 1", added_at: "2026-10-16T11:00:00Z" } as any;
const VERB = { word: "לְהַנִּיחַ", phonetic: "lehaniach", translation: "to put", lemma_key: "להנח|hifil", source_video_id: "v1", source_video_title: "Song 1", example_sentence: F1.sentence, verb_forms: [F1, F2, F3] };
const NOUN = { word: "נשמה", phonetic: "neshama", translation: "soul", source_video_id: "v1", source_video_title: "Song 1", example_sentence: "יש נשמה", verb_forms: null };

Deno.test("a word without verb_forms is not a verb card and keeps its single video", () => {
  assertEquals([isVerbCard(NOUN), verbForms(NOUN)], [false, []]);
  assertEquals([...wordVideoIds(NOUN)], ["v1"]);
  assertEquals([...wordVideoIds({ ...NOUN, source_video_id: null })], []);
  assertEquals(pickOccurrence(NOUN, "v1"), null);
  assertEquals([deckSentence(NOUN, "v2"), deckVideoTitle(NOUN, "v2")], ["יש נשמה", "Song 1"]);
});

Deno.test("a verb card belongs to every video it was met in", () => {
  assertEquals([...wordVideoIds(VERB)].sort(), ["v1", "v2"]);
  assert(isVerbCard(VERB));
});

Deno.test("each deck shows the form and sentence from its own video", () => {
  assertEquals(pickOccurrence(VERB, "v2")?.surface, "הנחתי");
  assertEquals(pickOccurrence(VERB, "v1")?.surface, "תניח");   // newest in v1
  assertEquals(pickOccurrence(VERB, null)?.surface, "הנחתי");  // newest overall
  assertEquals(pickOccurrence(VERB, "v9")?.surface, "הנחתי");
  assertEquals([deckSentence(VERB, "v2"), deckVideoTitle(VERB, "v2")], ["הנחתי לך", "Song 2"]);
  assertEquals(otherOccurrences(VERB, F2).map((o) => o.surface), ["שהנחת", "תניח"]);
});

Deno.test("grammar chips: only what is known", () => {
  assertEquals(grammarChips(F1), ["Past", "2nd person", "masculine", "singular"]);
  assertEquals(grammarChips(F2), ["Past", "1st person", "singular"]);
  assertEquals(grammarChips({ tense: "present", gender: "f", number: "pl" }), ["Present", "feminine", "plural"]);
  assertEquals(grammarChips(null), []);
});

Deno.test("seenSlots: every cell the student met", () => {
  assertEquals([...seenSlots(VERB)].sort(), ["future:2ms", "past:1s", "past:2ms"]);
  assertEquals(seenSlots(NOUN).size, 0);
});

Deno.test("highlightParts: the exact word, with nikud and punctuation ignored", () => {
  const p = highlightParts("ולפני שֶׁהֵנַחְתָּ, את הספר", "שהנחת");
  assertEquals(p.filter((x) => x.hit).map((x) => x.text), ["שֶׁהֵנַחְתָּ,"]);
  assertEquals(p.map((x) => x.text).join(""), "ולפני שֶׁהֵנַחְתָּ, את הספר");
  // Saved without its prefix, said with one.
  assertEquals(highlightParts("וכשהנחת אותו", "שהנחת").filter((x) => x.hit).map((x) => x.text), ["וכשהנחת"]);
  assertEquals(highlightParts("אין כאן כלום", "שהנחת").some((x) => x.hit), false);
  assertEquals(highlightParts("", "x"), []);
});

Deno.test("hasSavedWord: as a word (as before) or as a form of a verb card", () => {
  assert(hasSavedWord([NOUN], "נשמה"));
  assert(hasSavedWord([NOUN], "NESHAMA".toLowerCase()));
  assert(hasSavedWord([VERB], "שֶׁהֵנַחְתָּ"));
  assert(!hasSavedWord([NOUN, VERB], "ספר"));
});

Deno.test("knownAnalysisFromCards: a form already met is reused without a call; the context translation is not", () => {
  const a = knownAnalysisFromCards([NOUN, VERB], "שהנחת");
  assertEquals(a, {
    is_verb: true, lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put", binyan: "hifil",
    tense: "past", person: 2, gender: "m", number: "sg", prefix: "ש", form: "הנחת", phonetic: "shehenachta", translation: "",
  });
  assertEquals(knownAnalysisFromCards([NOUN, VERB], "נשמה"), undefined);
  assertEquals(knownAnalysisFromCards([], "x"), undefined);
});

Deno.test("conjugationRequest: the card's infinitive and binyan", () => {
  assertEquals(conjugationRequest(VERB, "hebrew"), { language: "hebrew", lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put", binyan: "hifil" });
});
