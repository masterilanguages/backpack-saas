// Transcription provider abstraction — shared types.
//
// The app never talks to a concrete transcription vendor. It describes WHAT it
// wants transcribed (a MediaSource) and calls transcribeMediaSource(); the
// registry (./index.ts) picks a provider. This keeps Supadata, OpenAI, or any
// future engine swappable without touching callers or the UI.

// What we want transcribed. `kind` discriminates the union.
//  - youtube: a YouTube video id. Server-side audio download is blocked from
//    datacenter IPs, so a YouTube-aware provider (Supadata) handles it.
//  - audio: a directly-fetchable audio file URL (e.g. an uploaded mp3 in
//    Supabase storage). We HAVE the bytes, so a file-based ASR (OpenAI
//    gpt-4o-transcribe) can be used.
export type MediaSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "audio"; audioUrl: string; mimeType?: string };

// One timed line of transcript. start/duration are in SECONDS (the app's
// storage format). Providers that can't produce reliable timings still return
// segments; start may be an estimate (see the OpenAI provider).
export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptResult {
  transcript: TranscriptSegment[];
  // Detected/returned language code (ISO 639-1 where known), or the requested
  // one as a fallback.
  language: string;
  // Which engine produced this, for UI/telemetry: e.g. "supadata_ai",
  // "youtube_captions", "openai_gpt4o_transcribe", "none".
  source: string;
  availableLanguages?: string[];
  // Populated only when transcript is empty; callers branch on this.
  error?: string;
  details?: string;
  // Breadcrumb of what the provider did, surfaced for debugging.
  steps: string[];
}

export interface TranscribeOptions {
  // Requested language as a bare ISO 639-1 code ("he", "es", ...). Providers
  // use it to bias ASR and to validate/reject wrong-language output.
  language?: string;
  // Wall-clock budget. Supabase edge functions hard-stop around 150s, so the
  // registry passes a conservative budget and providers must respect it.
  budgetMs?: number;
}

// A pluggable engine. `supports` gates on the source kind AND on the provider
// being usable right now (e.g. its API key is configured) — so the registry
// can fall through to the next candidate when one isn't available.
export interface TranscriptionProvider {
  readonly id: string;
  supports(source: MediaSource): boolean;
  transcribe(source: MediaSource, opts: TranscribeOptions): Promise<TranscriptResult>;
}
