/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepAction, prepStopped } from "./chapterPrepStatus.ts";

Deno.test("no server record (or migration not applied): ask the server, never prepare it in the browser", () => {
  assertEquals(prepAction(null), "request");
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

import { cardPrep, newlyReady } from "./chapterPrepStatus.ts";

Deno.test("card: Ready to learn only once the published chapter exists", () => {
  assertEquals(cardPrep(true, null).state, "ready");
  assertEquals(cardPrep(true, { status: "failed", busy: false, resumable: false }).state, "ready");
  // the server says ready but the chapter isn't loaded yet: still preparing
  assertEquals(cardPrep(false, { status: "ready", busy: false, resumable: false }).state, "preparing");
});

Deno.test("card: preparing while the server works; a new video (no record) asks the server", () => {
  assertEquals(cardPrep(false, null), { state: "preparing", retry: false, autoResume: true });
  for (const status of ["queued", "transcribing", "translating", "publishing"]) {
    assertEquals(cardPrep(false, { status, busy: true, resumable: false }), { state: "preparing", retry: false, autoResume: false });
  }
});

Deno.test("card: a run cut off mid-way is resumed on its own (the student sees preparing)", () => {
  for (const status of ["queued", "transcribing", "translating", "pending_recovery"]) {
    assertEquals(cardPrep(false, { status, busy: false, resumable: true }), { state: "preparing", retry: false, autoResume: true });
  }
});

Deno.test("card: a temporary failure offers Try again; never an automatic paid loop", () => {
  assertEquals(cardPrep(false, { status: "failed", busy: false, resumable: true }), { state: "failed", retry: true, autoResume: false });
});

Deno.test("card: no retry when it would only pay again; account problems are 'unavailable'", () => {
  assertEquals(cardPrep(false, { status: "failed", busy: false, resumable: false }), { state: "failed", retry: false, autoResume: false });
  assertEquals(cardPrep(false, { status: "translating", busy: false, resumable: false }), { state: "failed", retry: false, autoResume: false }); // 5 attempts used
  assertEquals(cardPrep(false, { status: "blocked", busy: false, resumable: false }), { state: "unavailable", retry: false, autoResume: false });
});

Deno.test("newlyReady: the preparing videos whose chapter has arrived", () => {
  assertEquals(newlyReady(["a", "b", "c"], new Set(["b", "x"])), ["b"]);
  assertEquals(newlyReady([], new Set(["b"])), []);
});
