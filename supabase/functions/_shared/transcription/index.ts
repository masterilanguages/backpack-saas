// Transcription registry — the single entry point callers use.
//
//   const result = await transcribeMediaSource(source, { language });
//
// Callers describe the media; the registry picks a provider by preference and
// availability. Adding a new engine (e.g. an OpenAI-over-fetched-YouTube-audio
// provider) means appending it here — no caller or UI change.
import type { MediaSource, TranscribeOptions, TranscriptResult } from "./types.ts";
import { elevenlabsProvider } from "./elevenlabs.ts";
import { openaiProvider } from "./openai.ts";
import { supadataProvider } from "./supadata.ts";

export type { MediaSource, TranscribeOptions, TranscriptResult, TranscriptSegment } from "./types.ts";

// Preference order. Providers whose supports() is true are tried in turn until
// one returns a transcript:
//  - ElevenLabs Scribe (youtube + audio) -> word-level timings, so sentence
//                       edges are exact (Scribe fetches YouTube itself)
//  - uploaded audio  -> OpenAI gpt-4o-transcribe (we hold the bytes)
//  - youtube         -> Supadata audio ASR (~5 s chunk timings)
// supports() also gates on the provider's key being configured, so an
// unconfigured provider is skipped rather than erroring.
const PROVIDERS = [elevenlabsProvider, openaiProvider, supadataProvider];

// Supabase edge functions hard-stop around 150s; the first provider gets part
// of it and a fallback gets what is left.
const TOTAL_BUDGET_MS = 135_000;
const FIRST_BUDGET_MS = 70_000;

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
  const candidates = PROVIDERS.filter((p) => p.supports(source));
  if (!candidates.length) {
    return {
      transcript: [],
      language: opts.language || "unknown",
      source: "none",
      steps: ["no_provider"],
      error: unavailableReason(source),
    };
  }
  const started = Date.now();
  const steps: string[] = [];
  let result: TranscriptResult | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i];
    const left = (opts.budgetMs ?? TOTAL_BUDGET_MS) - (Date.now() - started);
    if (i > 0 && left < 20_000) break;
    const budgetMs = i < candidates.length - 1 ? Math.min(FIRST_BUDGET_MS, left) : left;
    result = await provider.transcribe(source, { ...opts, budgetMs });
    steps.push(`provider:${provider.id}`, ...result.steps);
    if (result.transcript.length) break;
  }
  return { ...result!, steps };
}
