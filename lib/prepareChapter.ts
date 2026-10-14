import { base44 } from "@/api/base44Client";

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
