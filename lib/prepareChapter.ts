import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { prepStopped, type PrepStatus } from "@/lib/chapterPrepStatus";

/**
 * The server's preparation status of a video (chapter_prep_status). null when
 * the server has no record — or the status can't be read (e.g. migration 2100
 * not applied yet), so the app keeps its behavior from before phase 2A.
 */
export async function chapterPrepStatus(videoId: string | null | undefined): Promise<PrepStatus> {
  if (!videoId) return null;
  try {
    const { data, error } = await (supabase as any).rpc("chapter_prep_status", { p_video_id: videoId });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { status: String(row.status), busy: !!row.busy, resumable: !!row.resumable } : null;
  } catch {
    return null;
  }
}

/**
 * Asks the server to prepare a video's chapter sentences now (transcription,
 * timing, transliteration, translation), so students never wait on
 * "Preparing the sentences…". Fire-and-forget: it replies at once and works in
 * the background; failures are only logged (the app can still prepare the
 * chapter on first open). force: rebuild an already prepared chapter, e.g.
 * after importing lyrics.
 */
export async function requestChapterPrep(videoId: string | null | undefined, language?: string | null, force = false) {
  if (!videoId) return null;
  try {
    return await (base44 as any).functions.invoke("prepareChapter", { videoId, language: language || "hebrew", force });
  } catch (e) {
    console.warn("[prepareChapter] request failed", videoId, e);
    return null;
  }
}

/**
 * Waits while the server prepares a video's chapter (polling). "ready": the
 * chapter is published — seen in chapter_content itself, so it also works
 * while an older site or function version is live. "stopped": the server
 * stopped and a retry is not worth it (after giving a resume request a few
 * polls to start). "timeout" / "abandoned" (the student moved on) end the
 * wait without a result.
 */
export async function waitForServerChapter(
  videoId: string,
  stillWanted: () => boolean,
  // 10 min: on the Free plan a run stops at 150 s and a long video continues
  // in further runs, so the whole preparation can outlast a single run.
  { intervalMs = 5000, maxMs = 600_000 } = {},
): Promise<"ready" | "stopped" | "timeout" | "abandoned"> {
  const started = Date.now();
  for (let polls = 1; Date.now() - started < maxMs; polls++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (!stillWanted()) return "abandoned";
    const published = await (base44 as any).entities.ChapterContent.filter({ video_id: videoId }).catch(() => null);
    if (published?.length) return "ready";
    const s = await chapterPrepStatus(videoId);
    if (polls >= 3 && prepStopped(s)) return "stopped";
  }
  return "timeout";
}
