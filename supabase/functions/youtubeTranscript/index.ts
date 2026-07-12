// youtubeTranscript — fetches a YouTube transcript via Supadata.
//
// Replaces the old fragile approach (scraping the watch page + Whisper on the
// audio stream), which YouTube blocks from datacenter IPs. Supadata handles the
// anti-bot/signature-cipher mess and falls back to AI transcription when a video
// has no captions, so it works for arbitrary third-party videos.
//
// LANGUAGE CORRECTNESS (Hebrew bug): YouTube's own auto-captions for Hebrew
// videos are frequently an ARABIC ASR track (Hebrew is poorly supported by
// YouTube's captioner), so fetching the default track returned Arabic text and
// "[موسيقى]" noise markers. Fix, in order:
//   1. Callers now pass `language`; we request that track (`lang=`).
//   2. The returned transcript is validated against the requested language —
//      both the reported lang code and, for Hebrew, a Unicode-script check
//      (Hebrew U+0590-05FF vs Arabic U+0600-06FF), since mislabeled tracks lie.
//   3. On mismatch (or when no captions exist) we retry with `mode=generate`:
//      Supadata AI-transcribes the actual audio (Whisper-class ASR, which
//      handles Hebrew correctly), polling the async job until done.
//   4. Caption noise cues ("[Music]", "[موسيقى]", "[מחיאות כפיים]", ♪) are
//      stripped; segments that were only noise are dropped.
//
// RETURN SHAPE — unchanged (callers read result.data.X in BabyVideos.jsx,
// MediaLibrary.jsx, AddVideoDialog.jsx, VideoTranscript.jsx):
//   data.transcript  -> [{ text, start, duration }]   (start/duration in SECONDS)
//   data.language    -> detected language code
//   data.source      -> 'youtube_captions' | 'ai_generated' | 'none'
//   data.video_id, data.title, data.steps, data.processingTime
//   data.error, data.details   (read when transcript is empty)
//
// We never 500 the "no transcript" case — callers branch on result.data.error,
// so a missing transcript returns { data: { transcript: [], error } } at HTTP 200.
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPADATA_BASE = "https://api.supadata.ai/v1";
const LANGUAGE_CODE: Record<string, string> = {
  english: "en",
  spanish: "es",
  hebrew: "he",
  french: "fr",
  portuguese: "pt",
  italian: "it",
};

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

// Fetch a transcript from Supadata, polling the async-job path when needed.
// Returns the final payload (with .content) or throws-lite via { error }.
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
  let payload: any = await resp.json().catch(() => ({}));
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

// Supadata offsets/durations are in MILLISECONDS; the app expects seconds.
function toSegments(content: any[]): { text: string; start: number; duration: number }[] {
  return content
    .map((s: any) => ({
      text: cleanCaptionText(String(s?.text ?? "")),
      start: typeof s?.offset === "number" ? s.offset / 1000 : 0,
      duration: typeof s?.duration === "number" ? s.duration / 1000 : 3,
    }))
    .filter((s) => s.text.length > 0);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  let videoId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    videoId = body?.videoId;
    const requestedLanguage = String(body?.language || "").toLowerCase();
    const reqCode = normLang(LANGUAGE_CODE[requestedLanguage] || requestedLanguage);
    if (!videoId) {
      return json({ data: { transcript: [], error: "videoId is required" } }, 400);
    }

    const apiKey = Deno.env.get("SUPADATA_API_KEY");
    if (!apiKey) {
      return json({
        data: { transcript: [], error: "SUPADATA_API_KEY is not set", source: "none", video_id: videoId },
      });
    }

    const steps: string[] = [];
    const fail = (error: string) =>
      json({
        data: { transcript: [], error, source: "none", video_id: videoId, steps, processingTime: elapsed() },
      });

    // 1) Native/auto captions in the requested language.
    // Budgets: 35s captions + 100s AI generation keeps the worst case under
    // Supabase's 150s edge-function wall-clock limit.
    let payload = await fetchSupadata(apiKey, videoId, { lang: reqCode || undefined }, 35_000);
    steps.push("captions_fetched");
    let source = "youtube_captions";

    let content: any[] = Array.isArray(payload?.content) ? payload.content : [];
    let returnedLang = normLang(payload?.lang);
    const sample = content.slice(0, 60).map((s: any) => s?.text || "").join(" ");
    const wrongLanguage = content.length > 0 && !matchesRequestedLanguage(sample, returnedLang, reqCode);

    // 2) Wrong-language track (e.g. Arabic auto-captions on a Hebrew video) or
    //    no captions at all -> AI-transcribe the actual audio. Whisper-class
    //    ASR detects and transcribes Hebrew correctly, unlike YouTube's captioner.
    if (wrongLanguage || content.length === 0 || payload?.error) {
      steps.push(wrongLanguage ? `wrong_language_track:${returnedLang || "unknown"}` : "no_captions");
      const generated = await fetchSupadata(apiKey, videoId, { mode: "generate" }, 100_000);
      steps.push("ai_generated");
      const genContent: any[] = Array.isArray(generated?.content) ? generated.content : [];
      if (genContent.length > 0) {
        payload = generated;
        content = genContent;
        returnedLang = normLang(generated?.lang);
        source = "ai_generated";
      } else if (content.length === 0) {
        return fail(generated?.error || payload?.error || "No transcript available for this video.");
      }
      // If generation failed but we DO have caption content, fall through and
      // return the captions (wrong-language captions beat nothing; the caller
      // surface shows the language so the user can retry).
    }

    const transcript = toSegments(content);
    if (transcript.length === 0) {
      return fail("No transcript available for this video.");
    }

    steps.push("complete");
    return json({
      data: {
        transcript,
        language: returnedLang || reqCode || "unknown",
        requested_language: reqCode || "unknown",
        available_languages: payload?.availableLangs || [],
        source,
        video_id: videoId,
        processingTime: elapsed(),
        steps,
      },
    });
  } catch (error: any) {
    return json({
      data: {
        transcript: [],
        error: error?.message || "Failed to fetch transcript",
        details: error?.stack,
        source: "none",
        video_id: videoId,
        processingTime: elapsed(),
      },
    });
  }
});
