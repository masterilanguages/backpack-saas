/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractLetrasLyrics } from "./letras.ts";

Deno.test("extractLetrasLyrics preserves the verse order and drops markup", () => {
  const html = `
    <main>
      <div class="lyric-original">
        <p>\u05d1\u05d5\u05e8\u05da \u05d1\u05e1\u05d7 \u05dc\u05d5\u05de\u05da<br>\u05db\u05d5\u05e8\u05db\u05e8\u05d9\u05ea \u05ea\u05e9\u05dc\u05d5\u05de\u05da</p>
        <p>\u05ea\u05df \u05dc\u05d9 \u05ea\u05e4\u05d9\u05dc\u05d4</p>
      </div>
      <aside>Suggested songs</aside>
    </main>`;

  assertEquals(extractLetrasLyrics(html), [
    "\u05d1\u05d5\u05e8\u05da \u05d1\u05e1\u05d7 \u05dc\u05d5\u05de\u05da",
    "\u05db\u05d5\u05e8\u05db\u05e8\u05d9\u05ea \u05ea\u05e9\u05dc\u05d5\u05de\u05da",
    "\u05ea\u05df \u05dc\u05d9 \u05ea\u05e4\u05d9\u05dc\u05d4",
  ]);
});

Deno.test("extractLetrasLyrics returns no lines when the lyrics container is absent", () => {
  assertEquals(extractLetrasLyrics("<main><p>No lyrics here</p></main>"), []);
});
