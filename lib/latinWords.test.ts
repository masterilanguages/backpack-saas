/// <reference lib="deno.ns" />
// Run: deno test lib/latinWords.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { latinWords } from "./latinWords.ts";

const he = ["שלום.", "איך", "קוראים", "לך?"];

Deno.test("glosses line up: one Latin word per native word, punctuation carried over", () => {
  const g = [{ phonetic: "shalom" }, { phonetic: "eich" }, { phonetic: "korim" }, { phonetic: "lach" }];
  assertEquals(latinWords(he, g, "shalom. eich korim lach?"), ["shalom.", "eich", "korim", "lach?"]);
});

Deno.test("a gloss that already has the mark is not doubled", () => {
  const g = [{ phonetic: "shalom." }, { phonetic: "eich" }, { phonetic: "korim" }, { phonetic: "lach?" }];
  assertEquals(latinWords(he, g), ["shalom.", "eich", "korim", "lach?"]);
});

Deno.test("misaligned glosses: falls back to the transliteration when counts match", () => {
  assertEquals(latinWords(he, [{ phonetic: "shalom" }], "shalom. eich korim lach?"), ["shalom.", "eich", "korim", "lach?"]);
});

Deno.test("a gloss without phonetic takes the transliteration's word, else keeps the native word", () => {
  const g = [{ phonetic: "shalom" }, { phonetic: "" }, { phonetic: "korim" }, { phonetic: "lach" }];
  assertEquals(latinWords(he, g, "shalom. eich korim lach?"), ["shalom.", "eich", "korim", "lach?"]);
  assertEquals(latinWords(he, g, "shalom eich"), ["shalom.", "איך", "korim", "lach?"]);
});

Deno.test("nothing lines up: null (the Latin line is shown but not tappable)", () => {
  assertEquals(latinWords(he, null, "shalom eich korim otach lach?"), null);
  assertEquals(latinWords([], null, "x"), null);
});
