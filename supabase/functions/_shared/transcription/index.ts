// Transcription registry — the single entry point callers use.
//
//   const result = await transcribeMediaSource(source, { language });
//
// Callers describe the media; the registry picks a provider by preference and
// availability. Adding a new engine (e.g. an OpenAI-over-fetched-YouTube-audio
// provider) means appending it here — no caller or UI change.
import type { MediaSource, TranscribeOptions, TranscriptResult } from "./types.ts";
import { openaiProvider } from "./openai.ts";
import { supadataProvider } from "./supadata.ts";

export type { MediaSource, TranscribeOptions, TranscriptResult, TranscriptSegment } from "./types.ts";

// Preference order. First provider whose supports() is true wins:
//  - uploaded audio  -> OpenAI gpt-4o-transcribe (we hold the bytes)
//  - youtube         -> Supadata audio ASR (server-side YT audio download is
//                       blocked, so Supadata is the only viable path today)
// supports() also gates on the provider's key being configured, so an
// unconfigured provider is skipped rather than erroring.
const PROVIDERS = [openaiProvider, supadataProvider];

// Human-readable hint for when NO provider can handle a source — usually a
// missing API key for the only provider that matches the source kind.
function unavailableReason(source: MediaSource): string {
  if (source.kind === "audio") {
    return "Audio transcription is unavailable: OPENAI_API_KEY is not configured.";
  }
  if (source.kind === "youtube") {
    return "YouTube transcription is unavailable: SUPADATA_API_KEY is not configured.";
  }
  return "No transcription provider available for this media source.";
}

export async function transcribeMediaSource(
  source: MediaSource,
  opts: TranscribeOptions = {},
): Promise<TranscriptResult> {
  const provider = PROVIDERS.find((p) => p.supports(source));
  if (!provider) {
    return {
      transcript: [],
      language: opts.language || "unknown",
      source: "none",
      steps: ["no_provider"],
      error: unavailableReason(source),
    };
  }
  const result = await provider.transcribe(source, opts);
  return { ...result, steps: [`provider:${provider.id}`, ...result.steps] };
}
