// Supadata provider — handles `kind: "youtube"`.
//
// MVP engine (per product decision): transcribe the ACTUAL AUDIO, not YouTube's
// captions. YouTube's own auto-captions for Hebrew are frequently an ARABIC ASR
// track (Hebrew is poorly supported by their captioner), which produced Arabic
// text and "[موسيقى]" noise. Supadata's `mode=generate` runs Whisper-class ASR
// on the audio and detects/transcribes the real language correctly.
//
// Order of attempts:
//   1. mode=generate (audio ASR) in the requested language — the source of truth.
//   2. If generation fails/times out, fall back to native captions (validated
//      against the requested language) so a link still yields *something*.
//   3. Caption noise cues ("[Music]", "[موسيقى]", ♪) are stripped; noise-only
//      segments are dropped.
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

function scriptCounts(text: string) {
  let hebrew = 0, arabic = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0590 && c <= 0x05ff) hebrew++;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f)) arabic++;
  }
  return { hebrew, arabic };
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

// Does the fetched transcript plausibly match the requested language?
function matchesRequestedLanguage(sample: string, returnedLang: string, reqCode: string): boolean {
  if (!reqCode) return true;
  if (reqCode === "he") {
    const { hebrew, arabic } = scriptCounts(sample);
    // Arabic-script content is the known failure mode; also reject tracks that
    // claim another language and contain (nearly) no Hebrew at all.
    if (arabic > hebrew) return false;
    if (returnedLang && returnedLang !== "he" && hebrew < 20) return false;
    return true;
  }
  return !returnedLang || returnedLang === reqCode;
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
    // Split the budget: most goes to audio generation (the primary path), a
    // slice reserved for the caption fallback. Keeps the worst case under
    // Supabase's ~150s edge wall-clock.
    const totalBudget = opts.budgetMs ?? 135_000;
    const genBudget = Math.round(totalBudget * 0.75);
    const capBudget = totalBudget - genBudget;

    // 1) Audio ASR (the product default) — correct language, no caption noise.
    const generated = await fetchSupadata(apiKey, videoId, { mode: "generate" }, genBudget);
    steps.push("audio_generate");
    let content: any[] = Array.isArray(generated?.content) ? generated.content : [];
    let returnedLang = normLang(generated?.lang);
    let source_id = "supadata_ai";
    let payload = generated;

    // 2) Fallback: native captions (validated) if audio ASR yielded nothing.
    if (content.length === 0) {
      steps.push(`audio_generate_failed:${generated?.error || "empty"}`);
      const captions = await fetchSupadata(apiKey, videoId, { lang: reqCode || undefined }, capBudget);
      steps.push("captions_fetched");
      const capContent: any[] = Array.isArray(captions?.content) ? captions.content : [];
      const capLang = normLang(captions?.lang);
      const sample = capContent.slice(0, 60).map((s: any) => s?.text || "").join(" ");
      // Only accept captions that plausibly match the requested language — a
      // wrong-language track is worse than an honest failure.
      if (capContent.length > 0 && matchesRequestedLanguage(sample, capLang, reqCode)) {
        content = capContent;
        returnedLang = capLang;
        source_id = "youtube_captions";
        payload = captions;
      } else if (capContent.length > 0) {
        steps.push(`captions_wrong_language:${capLang || "unknown"}`);
      }
    }

    const transcript = toSegments(content);
    if (transcript.length === 0) {
      return {
        transcript: [],
        language: reqCode || "unknown",
        source: "none",
        steps,
        error: generated?.error || payload?.error || "No transcript available for this video.",
      };
    }

    steps.push("complete");
    return {
      transcript,
      language: returnedLang || reqCode || "unknown",
      availableLanguages: payload?.availableLangs || [],
      source: source_id,
      steps,
    };
  },
};
