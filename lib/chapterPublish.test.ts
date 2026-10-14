/// <reference lib="deno.ns" />

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { publishChapter, untranslatedCount } from "./chapterPublish.ts";

// The real supabase-js client the edge function uses, with the network
// replaced: records each request and answers like PostgREST would.
function fakeDb(rowsReturned: number) {
  const calls: { method: string; url: URL; prefer: string; body: any }[] = [];
  const db = createClient("https://example.supabase.co", "service-key", {
    global: {
      fetch: async (input: any, init: any = {}) => {
        const headers = new Headers(init.headers);
        calls.push({ method: init.method, url: new URL(String(input)), prefer: headers.get("Prefer") || "", body: JSON.parse(init.body || "null") });
        return new Response(JSON.stringify(Array.from({ length: rowsReturned }, () => ({ video_id: "v1" }))), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  return { db, calls };
}

const done = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `t${i}`, transliteration: `p${i}`, english: `e${i}`, start: i, end: i + 1 }));
const row = (sentences: any[]) => ({ video_id: "v1", language: "hebrew", sentences, source: "elevenlabs_scribe" });

Deno.test("untranslatedCount: a missing or blank transliteration or English counts", () => {
  assertEquals(untranslatedCount(done(3)), 0);
  assertEquals(untranslatedCount([...done(2), { text: "x", transliteration: "x", english: "  " }, { text: "y", english: "y" }]), 2);
});

Deno.test("a chapter with any untranslated sentence is never written", async () => {
  const { db, calls } = fakeDb(1);
  const partial = [...done(9), { text: "x", transliteration: "", english: "" }];
  await assertRejects(() => publishChapter(db, row(partial), false, " (credit)"), Error, "not published: 1 of 10 sentences untranslated (credit)");
  await assertRejects(() => publishChapter(db, row(partial), true), Error, "not published");
  await assertRejects(() => publishChapter(db, row([]), false), Error, "no sentences");
  assertEquals(calls.length, 0);
});

Deno.test("without force: one INSERT … ON CONFLICT (video_id) DO NOTHING, no delete", async () => {
  const { db, calls } = fakeDb(1);
  assertEquals(await publishChapter(db, row(done(3)), false), "published");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].url.pathname, "/rest/v1/chapter_content");
  assertEquals(calls[0].url.searchParams.get("on_conflict"), "video_id");
  assertEquals(calls[0].prefer.includes("resolution=ignore-duplicates"), true);
  assertEquals(calls[0].body.sentences.length, 3);
});

Deno.test("without force, when another run published first: nothing returned → kept_existing", async () => {
  const { db } = fakeDb(0);
  assertEquals(await publishChapter(db, row(done(3)), false), "kept_existing");
});

Deno.test("with force: one INSERT … ON CONFLICT (video_id) DO UPDATE, no delete", async () => {
  const { db, calls } = fakeDb(1);
  assertEquals(await publishChapter(db, row(done(3)), true), "published");
  assertEquals(calls.map((c) => c.method), ["POST"]);
  assertEquals(calls[0].url.searchParams.get("on_conflict"), "video_id");
  assertEquals(calls[0].prefer.includes("resolution=merge-duplicates"), true);
});
