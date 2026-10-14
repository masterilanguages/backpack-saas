/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sentenceEpisodeIndex, wordEpisode } from "./backpackEpisodes.ts";

const sentences = [
  { start: 0, end: 4, hebrew: "מוֹדֶה אֲנִי לְפָנֶיךָ", text: "מוֹדֶה אֲנִי לְפָנֶיךָ" },
  { start: 4, end: 9, hebrew: "מֶלֶךְ חַי וְקַיָּם", text: "מֶלֶךְ חַי וְקַיָּם" },
  { start: 30, end: 36, hebrew: "שֶׁהֶחֱזַרְתָּ בִּי נִשְׁמָתִי", text: "שֶׁהֶחֱזַרְתָּ בִּי נִשְׁמָתִי" },
  { start: 36, end: 40, hebrew: "מוֹדֶה אֲנִי לְפָנֶיךָ", text: "מוֹדֶה אֲנִי לְפָנֶיךָ" },
];
const episodes = [
  { number: 1, start: 0, end: 30, first: 0, last: 1 },
  { number: 2, start: 30, end: 40, first: 2, last: 3 },
];
const index = sentenceEpisodeIndex(sentences, episodes);

Deno.test("a sentence saved with niqqud finds its episode", () => {
  assertEquals(wordEpisode({ example_sentence: "שֶׁהֶחֱזַרְתָּ בִּי נִשְׁמָתִי" }, index), 2);
});

Deno.test("a sentence saved without niqqud or punctuation still matches", () => {
  assertEquals(wordEpisode({ example_sentence: "מלך חי וקים." }, index), 1);
});

Deno.test("a repeated line belongs to the first episode it appears in", () => {
  assertEquals(wordEpisode({ example_sentence: "מודה אני לפניך" }, index), 1);
});

Deno.test("part of a longer line matches", () => {
  assertEquals(wordEpisode({ example_sentence: "שהחזרת בי" }, index), 2);
});

Deno.test("no sentence, or one not in the chapter, gives null", () => {
  assertEquals(wordEpisode({ example_sentence: null }, index), null);
  assertEquals(wordEpisode({ example_sentence: "שלום עולם ומלואו" }, index), null);
  assertEquals(wordEpisode({ example_sentence: "בי" }, index), null);
});
