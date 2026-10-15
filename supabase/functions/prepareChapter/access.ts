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

/**
 * The video is in the caller's school catalog: a catalog row of one of their
 * schools, or one with no school. Another school's catalog doesn't count.
 */
export const inSchoolCatalog = (catalogOrgIds: (string | null)[], myOrgIds: string[]) =>
  catalogOrgIds.some((org) => org == null || myOrgIds.includes(org));

export function prepAccess(q: AccessQuestion): AccessAnswer {
  if (isAdmin(q.caller)) return { ok: true };
  if (q.force) return { ok: false, status: 403, error: "Only admins can rebuild a chapter" };
  if (q.inSharedLibrary || q.inOwnLibrary) return { ok: true };
  return { ok: false, status: 403, error: "This video is not in your library" };
}

// Same rule as chapter_prep_status (migration 2100): a retry can fix it — a
// run cut off, or a temporary AI error — and fewer than 5 attempts were made.
const IN_PROGRESS = ["queued", "transcribing", "translating", "publishing", "pending_recovery"];
const RETRYABLE_KINDS = ["rate_limit", "overloaded", "timeout", "lease_lost", "incomplete", "unknown"];

/**
 * A preparation that stopped for good (failed transcription, no AI credit,
 * 5 attempts used): a student asking again would only pay again, so only an
 * admin may restart it. A run in progress or a retryable stop is not stopped.
 */
export function stoppedForUsers(
  row: { status: string; attempts: number; error_kind: string | null; locked_until: string | null } | null,
  nowMs: number,
): boolean {
  if (!row || row.status === "ready") return false;
  const leaseFree = !row.locked_until || new Date(row.locked_until).getTime() <= nowMs;
  if (!leaseFree) return false; // a run holds it: the request just finds it busy
  const resumable = row.attempts < 5 &&
    (IN_PROGRESS.includes(row.status) || (row.status === "failed" && RETRYABLE_KINDS.includes(row.error_kind || "")));
  return !resumable;
}
