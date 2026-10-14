/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepAction, prepStopped } from "./chapterPrepStatus.ts";

Deno.test("no server record (or migration not applied): the app prepares it, as before", () => {
  assertEquals(prepAction(null), "local");
});

Deno.test("a server run holds it: the browser never prepares it too", () => {
  for (const status of ["queued", "transcribing", "translating", "publishing"]) assertEquals(prepAction({ status, busy: true }), "wait");
  // A run that is still holding the video, even if its status says it stopped.
  assertEquals(prepAction({ status: "failed", busy: true }), "wait");
});

Deno.test("the server stopped: ask it to resume, never prepare it in the browser", () => {
  for (const status of ["failed", "blocked", "pending_recovery"]) assertEquals(prepAction({ status, busy: false, error_kind: "credit" }), "resume");
});

Deno.test("a run cut off mid-way (lease expired, status still in progress): resume, don't wait forever", () => {
  for (const status of ["queued", "transcribing", "translating", "publishing"]) assertEquals(prepAction({ status, busy: false }), "resume");
});

Deno.test("published", () => {
  assertEquals(prepAction({ status: "ready", busy: false }), "ready");
});

Deno.test("prepStopped tells a waiting app when to stop waiting", () => {
  assertEquals(prepStopped({ status: "translating", busy: true }), false);
  assertEquals(prepStopped({ status: "blocked", busy: false }), true);
  assertEquals(prepStopped(null), false);
});
