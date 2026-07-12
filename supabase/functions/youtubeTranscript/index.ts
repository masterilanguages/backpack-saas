// youtubeTranscript — DEPRECATED thin shim over the provider abstraction.
//
// New code should call the `transcribeMedia` endpoint with a MediaSource. This
// endpoint stays so already-deployed clients keep working; it just wraps the
// legacy { videoId, language } body into a youtube MediaSource and delegates to
// the shared registry (which now transcribes the actual audio via Supadata,
// fixing the Hebrew→Arabic caption bug).
//
// Response shape is unchanged (see transcribeMedia / the transcription types).
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { transcribeMediaSource } from "../_shared/transcription/index.ts";

const LANGUAGE_CODE: Record<string, string> = {
  english: "en", spanish: "es", hebrew: "he", french: "fr", portuguese: "pt", italian: "it",
};

function normLang(tag: unknown): string {
  const t = String(tag || "").toLowerCase().split(/[-_]/)[0];
  return t === "iw" ? "he" : t;
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
    if (!videoId) {
      return json({ data: { transcript: [], error: "videoId is required", source: "none" } }, 400);
    }
    const requestedLanguage = String(body?.language || "").toLowerCase();
    const reqCode = normLang(LANGUAGE_CODE[requestedLanguage] || requestedLanguage);

    const result = await transcribeMediaSource({ kind: "youtube", videoId }, { language: reqCode || undefined });

    return json({
      data: {
        transcript: result.transcript,
        language: result.language,
        requested_language: reqCode || "unknown",
        available_languages: result.availableLanguages || [],
        source: result.source,
        video_id: videoId,
        steps: result.steps,
        processingTime: elapsed(),
        ...(result.error ? { error: result.error } : {}),
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
