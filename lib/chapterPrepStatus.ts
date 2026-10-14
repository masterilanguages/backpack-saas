// What the app does when a video has no published chapter yet, given the
// server's preparation status (chapter_prep_status, migration 2100):
//
//   "local"  no server record (or the status can't be read): the app prepares
//            the chapter itself, as before phase 2A.
//   "wait"   the server is on it: never prepare it in the browser at the same
//            time (that paid twice); wait for the published chapter.
//   "resume" the server stopped (failed, blocked, pending recovery): ask it to
//            resume — it reuses what it already did — and wait.
//   "ready"  published: just load it.
// Pure: no imports.

export type PrepStatus = { status: string; busy: boolean; error_kind?: string | null } | null;
export type PrepAction = "local" | "wait" | "resume" | "ready";

const STOPPED = new Set(["failed", "blocked", "pending_recovery"]);

export function prepAction(s: PrepStatus): PrepAction {
  if (!s) return "local";
  if (s.status === "ready") return "ready";
  if (!s.busy && STOPPED.has(s.status)) return "resume";
  return "wait";
}

/** While waiting: true once the server has stopped without publishing. */
export const prepStopped = (s: PrepStatus) => !!s && !s.busy && STOPPED.has(s.status);
