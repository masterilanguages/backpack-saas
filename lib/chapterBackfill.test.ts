/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { videosNeedingChapter } from "./chapterBackfill.ts";

// The production library and chapters as of 2026-10-14 (media_library).
const library = [
  { video_id: "eGCx4h2UhzA", duration_minutes: 11.08 },
  { video_id: "-wYyIvFFp4g", duration_minutes: 11.25 },
  { video_id: "eGCx4h2UhzA", duration_minutes: 8.85 }, // listed twice
  { video_id: "IIbugkvWdYA", duration_minutes: 8.5 },
  { video_id: "BnwJNxgvRNA", duration_minutes: 7 },
  { video_id: "jhd4m58CPEw", duration_minutes: null },
  { video_id: "iCibVi3p-D0", duration_minutes: 10.33 }, // chapter ends at 3:30
  { video_id: "", duration_minutes: 1 },
];
const prepared = ["-wYyIvFFp4g", "IIbugkvWdYA", "eGCx4h2UhzA", "jhd4m58CPEw", "iCibVi3p-D0"];

Deno.test("only the video without a chapter is prepared", () => {
  assertEquals(videosNeedingChapter(library, prepared).map((v) => v.video_id), ["BnwJNxgvRNA"]);
});

Deno.test("a chapter ending at 3:30 (or anywhere) is never rebuilt from here", () => {
  assertEquals(videosNeedingChapter(library, prepared).some((v) => v.video_id === "iCibVi3p-D0"), false);
});

Deno.test("a video listed twice is sent once; rows without a video id are skipped", () => {
  assertEquals(videosNeedingChapter(library, []).map((v) => v.video_id), ["eGCx4h2UhzA", "-wYyIvFFp4g", "IIbugkvWdYA", "BnwJNxgvRNA", "jhd4m58CPEw", "iCibVi3p-D0"]);
});

Deno.test("everything prepared: nothing to send", () => {
  assertEquals(videosNeedingChapter(library, [...prepared, "BnwJNxgvRNA"]), []);
});
