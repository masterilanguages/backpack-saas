"use client";

// Client-side transcription interface.
//
// This is the ONLY thing the UI should import for transcription. Components
// describe the media (a MediaSource) and call transcribeMediaSource(); they
// never know or care which engine runs (Supadata for YouTube, OpenAI
// gpt-4o-transcribe for uploaded audio, or whatever we add later). Swapping or
// adding providers happens entirely in the `transcribeMedia` edge function.
import { base44 } from "@/api/base44Client";

export type MediaSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "audio"; audioUrl: string; mimeType?: string };

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

// Mirrors the edge function's `data` payload. `transcript` is empty when
// `error` is set — callers branch on that (nothing throws for "no transcript").
export interface TranscriptResult {
  transcript: TranscriptSegment[];
  language: string;
  requested_language?: string;
  available_languages?: string[];
  source: string;
  video_id?: string;
  steps?: string[];
  processingTime?: string;
  error?: string;
  details?: string;
}

export interface TranscribeOptions {
  // Target language as a NAME ("hebrew", "spanish", ...) or ISO code; the edge
  // function normalizes it.
  language?: string;
}

// Transcribe any supported media source. Resolves to a TranscriptResult
// (check `.error` / `.transcript.length`); rejects only on transport failure.
export async function transcribeMediaSource(
  source: MediaSource,
  opts: TranscribeOptions = {},
): Promise<TranscriptResult> {
  const result = await base44.functions.invoke("transcribeMedia", {
    source,
    language: opts.language || "",
  });
  return (result?.data || { transcript: [], language: "unknown", source: "none", error: "No response from transcription service" }) as TranscriptResult;
}

// Convenience constructors so callers don't hand-build source objects.
export function youtubeSource(videoId: string): MediaSource {
  return { kind: "youtube", videoId };
}

export function audioSource(audioUrl: string, mimeType?: string): MediaSource {
  return { kind: "audio", audioUrl, mimeType };
}
