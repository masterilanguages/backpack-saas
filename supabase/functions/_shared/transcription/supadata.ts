// Supadata provider — handles `kind: "youtube"`.
//
// AUDIO-ONLY (per product decision): transcribe the ACTUAL AUDIO via Supadata's
// `mode=generate` (Whisper-class ASR) and NEVER use YouTube captions — even
// when captions exist. Captions are auto-generated/edited/inconsistent with the
// spoken words (Hebrew videos frequently carry an ARABIC caption track, which
// produced Arabic text and "[موسيقى]" noise). The audio transcript is the
// single source of truth for all downstream features.
//
// The ASR auto-detects the spoken language and returns punctuated, timestamped
// segments. Noise cues ("[Music]", ♪) are stripped; noise-only segments are
// dropped. If generation fails, we FAIL honestly — the UI surfaces the error
// and the user can retry — rather than silently serving caption text.
//
// Server-side YouTube audio download is blocked from datacenter IPs, which is
// why we go through Supadata rather than fetching the stream ourselves.
import type {
  MediaSource,
  TranscribeOptions,
  TranscriptResult,
  TranscriptionProvider,
  TranscriptSegment,
} from "./types.ts";

const SUPADATA_BASE = "https://api.supadata.ai/v1";

// Normalize a lang tag to a bare ISO 639-1 code ("he-IL" -> "he", legacy
// YouTube "iw" -> "he").
function normLang(tag: unknown): string {
  const t = String(tag || "").toLowerCase().split(/[-_]/)[0];
  return t === "iw" ? "he" : t;
}

// Strip caption noise cues: bracketed markers in any language ("[Music]",
// "[موسيقى]", "[מוזיקה]", "[Applause]") and musical-note glyphs. Returns ""
// for segments that were nothing but noise so they get dropped.
function cleanCaptionText(text: string): string {
  return text
    .replace(/\[[^\]]{1,60}\]/g, " ")
    .replace(/[♪♫🎵🎶]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Supadata offsets/durations are in MILLISECONDS; the app expects seconds.
function toSegments(content: any[]): TranscriptSegment[] {
  return content
    .map((s: any) => ({
      text: cleanCaptionText(String(s?.text ?? "")),
      start: typeof s?.offset === "number" ? s.offset / 1000 : 0,
      duration: typeof s?.duration === "number" ? s.duration / 1000 : 3,
    }))
    .filter((s) => s.text.length > 0);
}

// Fetch a transcript from Supadata, polling the async-job path when needed.
async function fetchSupadata(
  apiKey: string,
  videoId: string,
  opts: { lang?: string; mode?: string },
  budgetMs: number,
): Promise<any> {
  const params = new URLSearchParams({ videoId });
  if (opts.lang) params.set("lang", opts.lang);
  if (opts.mode) params.set("mode", opts.mode);
  const deadline = Date.now() + budgetMs;

  const resp = await fetch(`${SUPADATA_BASE}/youtube/transcript?${params.toString()}`, {
    headers: { "x-api-key": apiKey },
  });
  const payload: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { error: payload?.message || payload?.error || `Supadata error ${resp.status}` };
  }

  // Async job path (typical for mode=generate): poll until ready or budget spent.
  if (!Array.isArray(payload?.content) && payload?.jobId) {
    const jobUrl = `${SUPADATA_BASE}/youtube/transcript/${payload.jobId}`;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const jr = await fetch(jobUrl, { headers: { "x-api-key": apiKey } });
      const jp: any = await jr.json().catch(() => ({}));
      if (Array.isArray(jp?.content) || jp?.status === "completed") return jp;
      if (jp?.status === "failed" || jp?.error) {
        return { error: jp?.error || "Supadata job failed" };
      }
    }
    return { error: "Transcript generation timed out — try again in a minute." };
  }
  return payload;
}

export const supadataProvider: TranscriptionProvider = {
  id: "supadata",

  supports(source: MediaSource): boolean {
    return source.kind === "youtube" && !!Deno.env.get("SUPADATA_API_KEY");
  },

  async transcribe(source: MediaSource, opts: TranscribeOptions): Promise<TranscriptResult> {
    if (source.kind !== "youtube") {
      return { transcript: [], language: "unknown", source: "none", steps: [], error: "supadata: unsupported source" };
    }
    const apiKey = Deno.env.get("SUPADATA_API_KEY");
    if (!apiKey) {
      return { transcript: [], language: "unknown", source: "none", steps: [], error: "SUPADATA_API_KEY is not set" };
    }

    const videoId = source.videoId;
    const reqCode = normLang(opts.language);
    const steps: string[] = [];
    // Whole budget goes to audio generation — there is deliberately no caption
    // fallback. Keeps the worst case under Supabase's ~150s edge wall-clock.
    const genBudget = opts.budgetMs ?? 135_000;

    // Audio ASR only — captions are never used, even when they exist.
    const generated = await fetchSupadata(apiKey, videoId, { mode: "generate" }, genBudget);
    steps.push("audio_generate");
    const content: any[] = Array.isArray(generated?.content) ? generated.content : [];
    const returnedLang = normLang(generated?.lang);

    const transcript = toSegments(content);
    if (transcript.length === 0) {
      steps.push(`audio_generate_failed:${generated?.error || "empty"}`);
      return {
        transcript: [],
        language: reqCode || "unknown",
        source: "none",
        steps,
        error: generated?.error ||
          "Could not transcribe this video's audio — try again in a minute.",
      };
    }

    steps.push("complete");
    return {
      transcript,
      language: returnedLang || reqCode || "unknown",
      availableLanguages: generated?.availableLangs || [],
      source: "supadata_ai",
      steps,
    };
  },
};
