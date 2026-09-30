// SerpApi caption fallback — YouTube's existing caption tracks (manual or
// auto-generated) in the requested language, with real timings.
//
// Used only when Supadata can't give the requested language: e.g. auto-dubbed
// videos where the ASR gets a FRENCH audio track and Supadata's native mode
// doesn't return the Hebrew caption track either. Optional: skipped when
// SERPAPI_API_KEY isn't configured.
//
// Docs: https://serpapi.com/youtube-video-transcript
//   GET https://serpapi.com/search.json?engine=youtube_video_transcript&v=<id>
//       [&language_code=<code>][&type=asr][&title=<track title>]&api_key=<key>
// An unmatched language_code silently returns the video's default track, so
// we first list the tracks (available_transcripts) and request an exact one.
import type { TranscriptSegment } from "./types.ts";

const SERPAPI_URL = "https://serpapi.com/search.json";

// YouTube still tags Hebrew as "iw".
function matchesCode(code: unknown, reqCode: string): boolean {
  const c = String(code || "").toLowerCase().split(/[-_]/)[0];
  return c === reqCode || (reqCode === "he" && c === "iw");
}

// Segment times may come as start_ms/end_ms or start/end (ms); normalize to
// seconds + duration like the rest of the pipeline.
function toSegments(items: any[]): TranscriptSegment[] {
  return items
    .map((s: any) => {
      const startMs = Number(s?.start_ms ?? s?.start ?? 0) || 0;
      const endMs = Number(s?.end_ms ?? s?.end ?? 0) || 0;
      return {
        text: String(s?.snippet ?? s?.text ?? "")
          .replace(/\[[^\]]{1,60}\]/g, " ")
          .replace(/[♪♫🎵🎶]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        start: startMs / 1000,
        duration: endMs > startMs ? (endMs - startMs) / 1000 : 3,
      };
    })
    .filter((s) => s.text.length > 0);
}

async function query(apiKey: string, videoId: string, extra: Record<string, string>): Promise<any> {
  const params = new URLSearchParams({ engine: "youtube_video_transcript", v: videoId, ...extra, api_key: apiKey });
  const resp = await fetch(`${SERPAPI_URL}?${params.toString()}`);
  return await resp.json().catch(() => ({}));
}

// Returns the requested-language track (manual preferred over auto-generated)
// if its text passes `accept` (the caller's script check).
export async function fetchSerpapiCaptions(
  videoId: string,
  reqCode: string,
  accept: (sample: string) => boolean,
  steps: string[],
): Promise<TranscriptSegment[]> {
  const apiKey = Deno.env.get("SERPAPI_API_KEY");
  if (!apiKey || !reqCode) return [];
  try {
    // 1 · Default track + the list of tracks.
    const first = await query(apiKey, videoId, {});
    const tracks: any[] = Array.isArray(first?.available_transcripts) ? first.available_transcripts : [];
    steps.push(`serpapi_tracks:${tracks.map((t: any) => `${t?.language_code || "?"}${t?.type ? "/" + t.type : ""}`).join(",") || (first?.error ? "error" : "none")}`);

    const check = (payload: any, label: string): TranscriptSegment[] => {
      const segs = toSegments(Array.isArray(payload?.transcript) ? payload.transcript : []);
      const sample = segs.slice(0, 40).map((s) => s.text).join(" ");
      steps.push(`serpapi:${label}:${segs.length}:${sample.slice(0, 24)}`);
      return segs.length > 0 && accept(sample) ? segs : [];
    };

    // The default track may already be the right one.
    const direct = check(first, "default");
    if (direct.length) return direct;

    // 2 · Exact requested-language track(s): manual first, then auto.
    const wanted = tracks
      .filter((t: any) => matchesCode(t?.language_code, reqCode))
      .sort((a: any, b: any) => (a?.type === "asr" ? 1 : 0) - (b?.type === "asr" ? 1 : 0))
      .slice(0, 2);
    for (const t of wanted) {
      const extra: Record<string, string> = { language_code: String(t.language_code) };
      if (t?.type) extra.type = String(t.type);
      if (t?.title) extra.title = String(t.title);
      const segs = check(await query(apiKey, videoId, extra), `${t.language_code}${t?.type ? "_" + t.type : ""}`);
      if (segs.length) return segs;
    }
  } catch (_e) {
    steps.push("serpapi:failed");
  }
  return [];
}
