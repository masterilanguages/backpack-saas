/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { glosslessCount, incompleteCount, untranslatedCount } from "./chapterPublish.ts";

const done = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `t${i}`, transliteration: `p${i}`, english: `e${i}`, start: i, end: i + 1 }));

Deno.test("untranslatedCount: a missing or blank transliteration or English counts", () => {
  assertEquals(untranslatedCount(done(3)), 0);
  assertEquals(untranslatedCount([...done(2), { text: "x", transliteration: "x", english: "  " }, { text: "y", english: "y" }]), 2);
});

Deno.test("glosslessCount: a sentence with words to gloss needs at least one gloss", () => {
  const w = [{ w: "x", phonetic: "x", meaning: "x" }];
  assertEquals(glosslessCount([{ text: "שלום", words: w }, { text: "hello there", words: w }]), 0);
  assertEquals(glosslessCount([{ text: "שלום", words: [] }, { hebrew: "שלום" }, { text: "เฮ" }]), 3);
});

Deno.test("glosslessCount: digits, spaces and punctuation only have nothing to gloss", () => {
  assertEquals(glosslessCount([{ text: "24" }, { text: "... !" }, { text: "" }, { text: ">>" }]), 0);
});

Deno.test("incompleteCount: missing transliteration, English or glosses, each counted once", () => {
  const ok = { text: "a", transliteration: "a", english: "a", words: [{ w: "a" }] };
  assertEquals(incompleteCount([ok, { ...ok, english: "" }, { ...ok, words: [] }, { ...ok, english: "", words: [] }]), 3);
});
