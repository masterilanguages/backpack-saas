/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildLyricSegments } from "./songLyrics.ts";

Deno.test("buildLyricSegments assigns lyric lines to non-decreasing source timings", () => {
  const result = buildLyricSegments(
    ["\u05e9\u05d5\u05e8\u05d4 \u05e8\u05d0\u05e9\u05d5\u05e0\u05d4", "\u05e9\u05d5\u05e8\u05d4 \u05e9\u05e0\u05d9\u05d4", "\u05e9\u05d5\u05e8\u05d4 \u05e9\u05dc\u05d9\u05e9\u05d9\u05ea"],
    [0, 4.5, 9],
    14,
  );

  assertEquals(result, [
    { text: "\u05e9\u05d5\u05e8\u05d4 \u05e8\u05d0\u05e9\u05d5\u05e0\u05d4", hebrew: "\u05e9\u05d5\u05e8\u05d4 \u05e8\u05d0\u05e9\u05d5\u05e0\u05d4", transliteration: "", english: "", start: 0, end: 4.5 },
    { text: "\u05e9\u05d5\u05e8\u05d4 \u05e9\u05e0\u05d9\u05d4", hebrew: "\u05e9\u05d5\u05e8\u05d4 \u05e9\u05e0\u05d9\u05d4", transliteration: "", english: "", start: 4.5, end: 9 },
    { text: "\u05e9\u05d5\u05e8\u05d4 \u05e9\u05dc\u05d9\u05e9\u05d9\u05ea", hebrew: "\u05e9\u05d5\u05e8\u05d4 \u05e9\u05dc\u05d9\u05e9\u05d9\u05ea", transliteration: "", english: "", start: 9, end: 14 },
  ]);
});
