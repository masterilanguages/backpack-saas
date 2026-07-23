// transcribeMedia — canonical, provider-agnostic transcription endpoint.
//
// The UI never names a vendor. It POSTs a MediaSource and gets back a
// transcript; provider selection happens in _shared/transcription. Today:
// YouTube -> Supadata audio ASR, uploaded audio -> OpenAI gpt-4o-transcribe.
//
// Request body (either shape):
//   { source: { kind: "youtube", videoId } | { kind: "audio", audioUrl, mimeType? }, language? }
//   { videoId, language }            // legacy — treated as a youtube source
//
// Response (unchanged legacy shape so existing callers keep working):
//   { data: { transcript, language, requested_language, available_languages,
//             source, video_id, steps, processingTime, error, details } }
// Never 500s the "no transcript" case — callers branch on data.error at HTTP 200.
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { transcribeMediaSource, type MediaSource } from "../_shared/transcription/index.ts";

// The app passes language NAMES ("hebrew"); map to bare ISO 639-1 codes.
const LANGUAGE_CODE: Record<string, string> = {
  english: "en",
  spanish: "es",
  hebrew: "he",
  french: "fr",
  portuguese: "pt",
  italian: "it",
};

function normLang(tag: unknown): string {
  const t = String(tag || "").toLowerCase().split(/[-_]/)[0];
  return t === "iw" ? "he" : t;
}

// Accept both the new { source } body and the legacy { videoId } body.
function parseSource(body: any): MediaSource | { error: string } {
  const src = body?.source;
  if (src && typeof src === "object") {
    if (src.kind === "youtube" && src.videoId) return { kind: "youtube", videoId: String(src.videoId) };
    if (src.kind === "audio" && src.audioUrl) {
      return { kind: "audio", audioUrl: String(src.audioUrl), mimeType: src.mimeType ? String(src.mimeType) : undefined };
    }
    return { error: "Invalid source: expected { kind: 'youtube', videoId } or { kind: 'audio', audioUrl }." };
  }
  // Legacy: bare videoId => youtube.
  if (body?.videoId) return { kind: "youtube", videoId: String(body.videoId) };
  return { error: "Provide a `source` or a `videoId`." };
}

// A stable label for the response's video_id field (callers read it).
function sourceLabel(source: MediaSource): string {
  return source.kind === "youtube" ? source.videoId : source.audioUrl;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  let source: MediaSource | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseSource(body);
    if ("error" in parsed) {
      return json({ data: { transcript: [], error: parsed.error, source: "none" } }, 400);
    }
    source = parsed;

    const requestedLanguage = String(body?.language || "").toLowerCase();
    const reqCode = normLang(LANGUAGE_CODE[requestedLanguage] || requestedLanguage);

    const result = await transcribeMediaSource(source, { language: reqCode || undefined });

    return json({
      data: {
        transcript: result.transcript,
        language: result.language,
        requested_language: reqCode || "unknown",
        available_languages: result.availableLanguages || [],
        source: result.source,
        video_id: sourceLabel(source),
        steps: result.steps,
        processingTime: elapsed(),
        ...(result.error ? { error: result.error } : {}),
        ...(result.details ? { details: result.details } : {}),
      },
    });
  } catch (error: any) {
    return json({
      data: {
        transcript: [],
        error: error?.message || "Failed to transcribe media",
        details: error?.stack,
        source: "none",
        video_id: source ? sourceLabel(source) : undefined,
        processingTime: elapsed(),
      },
    });
  }
});
