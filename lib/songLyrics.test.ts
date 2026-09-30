/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildLyricSegments, chapterContentKey, shouldRefreshChapter, splitScriptLine, timedSegmentsFromSavedTranscript } from "./songLyrics.ts";

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

Deno.test("timedSegmentsFromSavedTranscript reuses timings when editing a video", () => {
  assertEquals(
    timedSegmentsFromSavedTranscript([
      { hebrew: "\u05e9\u05d5\u05e8\u05d4 \u05d0", start: 1.2 },
      { text: "\u05e9\u05d5\u05e8\u05d4 \u05d1", start: 4.5 },
      { text: "", start: 8 },
    ]),
    [
      { text: "\u05e9\u05d5\u05e8\u05d4 \u05d0", start: 1.2 },
      { text: "\u05e9\u05d5\u05e8\u05d4 \u05d1", start: 4.5 },
    ],
  );
});

Deno.test("shouldRefreshChapter only invalidates cached chapters after a lyric import", () => {
  assertEquals(shouldRefreshChapter(true, 3), true);
  assertEquals(shouldRefreshChapter(false, 3), false);
  assertEquals(shouldRefreshChapter(true, 0), false);
});

Deno.test("chapterContentKey uses the table primary key before an optional entity id", () => {
  assertEquals(chapterContentKey({ video_id: "abc", id: "wrong" }), "abc");
  assertEquals(chapterContentKey({ id: "legacy" }), "legacy");
});

Deno.test("splitScriptLine separates a Hebrew verse glued to its romanization", () => {
  assertEquals(splitScriptLine("קום קרא בתחנוניםkum kara b'tachanunim"), {
    native: "קום קרא בתחנונים",
    latin: "kum kara b'tachanunim",
  });
  assertEquals(splitScriptLine("מה לך נרדם? ma lecha nirdam?"), {
    native: "מה לך נרדם?",
    latin: "ma lecha nirdam?",
  });
  assertEquals(splitScriptLine("שלום"), { native: "שלום", latin: "" });
  assertEquals(splitScriptLine("only latin"), { native: "only latin", latin: "" });
});
