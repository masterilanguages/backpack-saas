/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepAction, prepStopped } from "./chapterPrepStatus.ts";

Deno.test("no server record (or migration not applied): the app prepares it, as before", () => {
  assertEquals(prepAction(null), "local");
});

Deno.test("a server run holds it: the browser never prepares it too", () => {
  for (const status of ["queued", "transcribing", "translating", "publishing", "failed"]) {
    assertEquals(prepAction({ status, busy: true, resumable: false }), "wait");
  }
});

Deno.test("a retry can fix it (run cut off, temporary error): ask the server to resume", () => {
  for (const status of ["queued", "translating", "pending_recovery", "failed"]) {
    assertEquals(prepAction({ status, busy: false, resumable: true }), "resume");
  }
});

Deno.test("no credit, failed transcription or too many attempts: no paid retry, stored transcript now", () => {
  for (const status of ["blocked", "failed", "translating"]) {
    assertEquals(prepAction({ status, busy: false, resumable: false }), "stopped");
  }
});

Deno.test("published", () => {
  assertEquals(prepAction({ status: "ready", busy: false, resumable: false }), "ready");
});

Deno.test("prepStopped tells a waiting app when to stop waiting", () => {
  assertEquals(prepStopped({ status: "translating", busy: true, resumable: false }), false);
  assertEquals(prepStopped({ status: "failed", busy: false, resumable: true }), false);
  assertEquals(prepStopped({ status: "blocked", busy: false, resumable: false }), true);
  assertEquals(prepStopped({ status: "ready", busy: false, resumable: false }), false);
  assertEquals(prepStopped(null), false);
});
