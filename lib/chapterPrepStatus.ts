// What the app does when a video has no published chapter yet, given the
// server's preparation status (chapter_prep_status, migration 2100):
//
//   "request" no server record yet (or the status can't be read, e.g.
//             migration 2100 not applied): ask the server to prepare it and
//             wait. The browser never prepares or writes a chapter itself.
//   "wait"    a server run holds the video: never prepare it in the browser at
//             the same time (that paid twice); wait for the published chapter.
//   "resume"  no run holds it and the server says a retry can fix it (a run
//             cut off, a temporary AI error; at most 5 attempts): ask the
//             server to resume — it reuses what it already did — and wait.
//   "stopped" the server stopped and a retry would only pay again (no AI
//             credit, a failed transcription, too many attempts): show the
//             stored transcript now; an admin or the later recovery resumes it.
//   "ready"   published: just load it.
// Pure: no imports.

export type PrepStatus = { status: string; busy: boolean; resumable: boolean } | null;
export type PrepAction = "request" | "wait" | "resume" | "stopped" | "ready";

export function prepAction(s: PrepStatus): PrepAction {
  if (!s) return "request";
  if (s.status === "ready") return "ready";
  if (s.busy) return "wait";
  return s.resumable ? "resume" : "stopped";
}

/** While waiting: true once no run holds it and a retry is not worth it. */
export const prepStopped = (s: PrepStatus) => !!s && s.status !== "ready" && !s.busy && !s.resumable;

// A video's state on its Library card, from Add video until its lesson is
// ready. "ready" only when the published chapter exists (complete and
// validated, lib/chapterPublish); everything else is the server's status.
//   preparing    the server is on it, or will be (no record yet, or a run cut
//                off mid-way that is resumed on its own — at most 5 attempts)
//   failed       stopped. retry: a temporary error (Claude overloaded, a
//                timeout) that a retry can fix, reusing the finished stages
//   unavailable  an account problem (no AI credit, bad key): retrying would
//                not help; only admins see this (students see "failed")
export type CardPrep = "ready" | "preparing" | "failed" | "unavailable";
export interface CardPrepState { state: CardPrep; retry: boolean; autoResume: boolean }

export function cardPrep(hasChapter: boolean, s: PrepStatus): CardPrepState {
  if (hasChapter) return { state: "ready", retry: false, autoResume: false };
  if (!s) return { state: "preparing", retry: false, autoResume: true }; // ask the server
  if (s.status === "ready" || s.busy) return { state: "preparing", retry: false, autoResume: false };
  if (s.resumable) {
    return s.status === "failed"
      ? { state: "failed", retry: true, autoResume: false }
      : { state: "preparing", retry: false, autoResume: true }; // cut off mid-way: resume
  }
  if (s.status === "blocked") return { state: "unavailable", retry: false, autoResume: false };
  return { state: "failed", retry: false, autoResume: false };
}

/** Videos that were preparing and now have their chapter (for the "ready" notice). */
export const newlyReady = (wasPreparing: Iterable<string>, haveChapter: Set<string>) =>
  Array.from(wasPreparing).filter((id) => haveChapter.has(id));
