/// <reference lib="deno.ns" />

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { alignLinesToWords, normWord, wordsFromFragments } from "./lyricAlign.ts";

// The real case: ElevenLabs heard line 1 right, line 2 completely wrong
// ("כורכר בטח חלומי" for "קום קרא בתחנונים") and line 3 almost right.
const asr = [
  { text: "בן", start: 16.9, end: 17.3 }, { text: "אדם,", start: 17.4, end: 18.0 },
  { text: "מה", start: 18.6, end: 18.9 }, { text: "לך", start: 19.0, end: 19.4 }, { text: "נרדם?", start: 19.5, end: 21.9 },
  { text: "כורכר", start: 24.2, end: 25.6 }, { text: "בטח", start: 25.8, end: 26.9 }, { text: "חלומי.", start: 27.1, end: 29.3 },
  { text: "כל", start: 31.8, end: 32.2 }, { text: "דומייתך", start: 32.3, end: 33.4 }, { text: "לאוזניי", start: 33.5, end: 34.8 }, { text: "כטופי.", start: 35.0, end: 36.9 },
];

Deno.test("misheard lines take the timing of the words between their anchors", () => {
  const t = alignLinesToWords(["בן אדם, מה לך נרדם", "קום קרא בתחנונים", "קול דומייתך לאוזניי כתופים"], asr);
  assertEquals([t[0].start, t[0].end], [16.9, 21.9]);
  assertEquals([t[1].start, t[1].end], [24.2, 29.3]);
  assertEquals([t[2].start, t[2].end], [31.8, 36.9]);
  assertEquals(t[0].anchors, 5);
  assert(t[2].anchors >= 2);
});

Deno.test("intro chatter before the lyrics is skipped for free", () => {
  const withIntro = [{ text: "שלום", start: 1, end: 1.5 }, { text: "לכולם", start: 1.6, end: 2.2 }, ...asr];
  const t = alignLinesToWords(["בן אדם, מה לך נרדם"], withIntro);
  assertEquals(t[0].start, 16.9);
});

Deno.test("a lyric line that is never sung sits between its neighbours", () => {
  const t = alignLinesToWords(["בן אדם, מה לך נרדם", "שורה שלא מושרת בכלל", "קול דומייתך לאוזניי כתופים"], [...asr.slice(0, 5), ...asr.slice(8)]);
  assert(t[1].start >= t[0].end && t[1].end <= t[2].start);
});

Deno.test("normWord folds niqqud, punctuation and final letters", () => {
  assertEquals(normWord("נִרְדָּם?"), "נרדמ");
  assertEquals(normWord("Kum,"), "kum");
});

Deno.test("wordsFromFragments spreads a fragment's words over its duration", () => {
  assertEquals(wordsFromFragments([{ text: "a b", start: 0, end: 2 }]), [{ text: "a", start: 0, end: 1 }, { text: "b", start: 1, end: 2 }]);
});
