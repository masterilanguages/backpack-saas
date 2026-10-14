/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { prepAccess } from "./access.ts";

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
