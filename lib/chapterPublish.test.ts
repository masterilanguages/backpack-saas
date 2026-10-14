/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { untranslatedCount } from "./chapterPublish.ts";

const done = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `t${i}`, transliteration: `p${i}`, english: `e${i}`, start: i, end: i + 1 }));

Deno.test("untranslatedCount: a missing or blank transliteration or English counts", () => {
  assertEquals(untranslatedCount(done(3)), 0);
  assertEquals(untranslatedCount([...done(2), { text: "x", transliteration: "x", english: "  " }, { text: "y", english: "y" }]), 2);
});
