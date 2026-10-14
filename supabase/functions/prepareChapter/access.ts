// Who may ask prepareChapter for what. Every preparation can pay for a
// transcription and for Claude, so:
//   - the server itself (service role key: continuations) — anything;
//   - admins (app_metadata.user_role = "admin", set only by the server; the
//     same role Media's admin tools check) — any video, and rebuilds (force);
//   - everyone else — only the first preparation of a video that is in the
//     shared library or in their own saved videos; never a rebuild.
// Pure: the caller looks the video up and passes the answers in.

export type Caller = { kind: "internal" } | { kind: "user"; role: string };

export interface AccessQuestion {
  caller: Caller;
  force: boolean;
  /** Only looked up for non-admin users. */
  inSharedLibrary?: boolean;
  inOwnLibrary?: boolean;
}

export type AccessAnswer = { ok: true } | { ok: false; status: 403; error: string };

export const isAdmin = (c: Caller) => c.kind === "internal" || c.role === "admin";

export function prepAccess(q: AccessQuestion): AccessAnswer {
  if (isAdmin(q.caller)) return { ok: true };
  if (q.force) return { ok: false, status: 403, error: "Only admins can rebuild a chapter" };
  if (q.inSharedLibrary || q.inOwnLibrary) return { ok: true };
  return { ok: false, status: 403, error: "This video is not in your library" };
}
