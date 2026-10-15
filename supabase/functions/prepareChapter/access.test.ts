/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepAccess } from "./access.ts";
import { inSchoolCatalog } from "./access.ts";

const user = (role: string) => ({ kind: "user" as const, role });

Deno.test("the server itself (continuations) may do anything", () => {
  assertEquals(prepAccess({ caller: { kind: "internal" }, force: true }), { ok: true });
});

Deno.test("admins may rebuild (force) any video", () => {
  assertEquals(prepAccess({ caller: user("admin"), force: true }), { ok: true });
  assertEquals(prepAccess({ caller: user("admin"), force: false }), { ok: true });
});

Deno.test("nobody else may rebuild, even a video in their own library", () => {
  for (const role of ["user", "staff", "owner", ""]) {
    const a = prepAccess({ caller: user(role), force: true, inSharedLibrary: true, inOwnLibrary: true });
    assertEquals(a, { ok: false, status: 403, error: "Only admins can rebuild a chapter" });
  }
});

Deno.test("a student may ask for the first preparation of a library video or their own saved one", () => {
  assertEquals(prepAccess({ caller: user("user"), force: false, inSharedLibrary: true }), { ok: true });
  assertEquals(prepAccess({ caller: user("user"), force: false, inOwnLibrary: true }), { ok: true });
});

Deno.test("…but not of an arbitrary YouTube video", () => {
  assertEquals(prepAccess({ caller: user("user"), force: false, inSharedLibrary: false, inOwnLibrary: false }),
    { ok: false, status: 403, error: "This video is not in your library" });
});

Deno.test("a catalog counts only for the caller's school (or a catalog row with no school)", () => {
  assertEquals(inSchoolCatalog(["org-a"], ["org-a"]), true);
  assertEquals(inSchoolCatalog(["org-b"], ["org-a"]), false);
  assertEquals(inSchoolCatalog([null], []), true);
  assertEquals(inSchoolCatalog(["org-b", "org-a"], ["org-a"]), true);
  assertEquals(inSchoolCatalog([], ["org-a"]), false);
});

import { stoppedForUsers } from "./access.ts";
const NOW = Date.parse("2026-10-15T12:00:00Z");
const row = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status, attempts: 1, error_kind: null, locked_until: null, ...extra } as any);

Deno.test("stoppedForUsers: nothing yet, published, or a run holding it: not stopped", () => {
  assertEquals(stoppedForUsers(null, NOW), false);
  assertEquals(stoppedForUsers(row("ready"), NOW), false);
  assertEquals(stoppedForUsers(row("transcribing", { locked_until: "2026-10-15T12:02:00Z" }), NOW), false);
});

Deno.test("stoppedForUsers: cut off mid-way or a temporary error: a retry may run", () => {
  for (const status of ["queued", "transcribing", "translating", "publishing", "pending_recovery"]) {
    assertEquals(stoppedForUsers(row(status, { locked_until: "2026-10-15T11:50:00Z" }), NOW), false);
  }
  for (const kind of ["rate_limit", "overloaded", "timeout", "lease_lost", "incomplete", "unknown"]) {
    assertEquals(stoppedForUsers(row("failed", { error_kind: kind }), NOW), false);
  }
});

Deno.test("stoppedForUsers: a failed transcription, an account problem or 5 attempts: stopped", () => {
  assertEquals(stoppedForUsers(row("failed", { error_kind: "transcription" }), NOW), true);
  assertEquals(stoppedForUsers(row("blocked", { error_kind: "credit" }), NOW), true);
  assertEquals(stoppedForUsers(row("translating", { attempts: 5 }), NOW), true);
  assertEquals(stoppedForUsers(row("failed", { error_kind: "overloaded", attempts: 5 }), NOW), true);
});
