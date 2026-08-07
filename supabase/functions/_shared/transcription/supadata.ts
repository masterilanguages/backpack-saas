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

// Does the transcript's writing system match the requested language?
// Hebrew must come back in Hebrew script; the app's other languages
// (en/es/fr/pt/it) must come back in Latin script. Catches the failure mode
// where the ASR (or an upstream translated track) returns e.g. FRENCH text
// for a Hebrew video — wrong-language output must never be accepted.
function matchesRequestedScript(sample: string, reqCode: string): boolean {
  if (!reqCode) return true;
  let hebrew = 0, latin = 0, arabic = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0590 && c <= 0x05ff) hebrew++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x00c0 && c <= 0x024f)) latin++;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f)) arabic++;
  }
  if (reqCode === "he") return hebrew >= latin && hebrew > arabic;
  return latin >= hebrew && latin > arabic;
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
    const firstBudget = Math.min(75_000, genBudget);

    // Audio ASR only — captions are never used, even when they exist.
    // IMPORTANT: `lang` must NOT be sent with mode=generate — Supadata rejects
    // the combination with a 400 "Invalid Request" (verified live). The ASR
    // auto-detects the spoken language; wrong-language output is caught by the
    // script check below instead of an upfront pin.
    let generated = await fetchSupadata(apiKey, videoId, { mode: "generate" }, firstBudget);
    steps.push("audio_generate");
    let content: any[] = Array.isArray(generated?.content) ? generated.content : [];

    // Wrong writing system (e.g. YouTube served a FRENCH auto-dub track to
    // the ASR — Supadata caches its generate result per video, so a retry
    // cannot fix it). LAST RESORT: the video's native caption track in the
    // REQUESTED language, accepted only if its script actually matches.
    // Audio-first stays the rule; a validated same-language caption beats
    // returning nothing at all.
    let source_id = "supadata_ai";
    if (content.length > 0 && reqCode) {
      const sample = content.slice(0, 40).map((s: any) => s?.text || "").join(" ");
      if (!matchesRequestedScript(sample, reqCode)) {
        steps.push(`wrong_language:${normLang(generated?.lang) || "unknown"}`);
        const captions = await fetchSupadata(
          apiKey,
          videoId,
          { mode: "native", lang: reqCode },
          Math.max(20_000, genBudget - firstBudget),
        );
        steps.push("native_captions_fallback");
        const capContent: any[] = Array.isArray(captions?.content) ? captions.content : [];
        const capSample = capContent.slice(0, 40).map((s: any) => s?.text || "").join(" ");
        if (capContent.length > 0 && matchesRequestedScript(capSample, reqCode)) {
          generated = captions;
          content = capContent;
          source_id = "youtube_captions_validated";
        } else {
          steps.push("wrong_language_unrecoverable");
          return {
            transcript: [],
            language: reqCode,
            source: "none",
            steps,
            error: "The transcription came back in the wrong language — try again in a minute.",
          };
        }
      }
    }

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
      language: reqCode || returnedLang || "unknown",
      availableLanguages: generated?.availableLangs || [],
      source: source_id,
      steps,
    };
  },
};
