// OpenAI provider — handles `kind: "audio"` (a directly-fetchable audio file,
// e.g. an uploaded mp3 in Supabase storage).
//
// Uses gpt-4o-transcribe (highest quality) with gpt-4o-mini-transcribe as a
// cheaper/faster fallback. A language-specific prompt keeps the output in the
// ORIGINAL language (no translation) and preserves names/slang/filler and
// code-switched English.
//
// Timestamp caveat: gpt-4o-transcribe returns plain text without per-segment
// timings. We split into sentences and assign ESTIMATED start times (~2.5
// words/sec) so segments render and stay strictly increasing. Uploaded audio
// lessons don't have a synced video, so exact karaoke timing isn't required;
// when we later add a timestamp-capable model this provider can be upgraded
// without touching callers.
import type {
  MediaSource,
  TranscribeOptions,
  TranscriptResult,
  TranscriptionProvider,
  TranscriptSegment,
} from "./types.ts";

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const PRIMARY_MODEL = "gpt-4o-transcribe";
const FALLBACK_MODEL = "gpt-4o-mini-transcribe";

// Per-language transcription prompt. Keeps ASR in the source language and
// faithful to the speaker. Extend as we add target languages.
const LANGUAGE_PROMPTS: Record<string, string> = {
  he:
    "The audio is in Modern Hebrew. Transcribe it in Hebrew script with natural " +
    "punctuation. Preserve names, slang, filler words, and English words mixed " +
    "into the Hebrew. Do not translate. Keep the transcript faithful to the speaker.",
  es: "The audio is in Spanish. Transcribe it in Spanish with natural punctuation. Do not translate; keep it faithful to the speaker.",
  fr: "The audio is in French. Transcribe it in French with natural punctuation. Do not translate; keep it faithful to the speaker.",
  pt: "The audio is in Portuguese. Transcribe it in Portuguese with natural punctuation. Do not translate; keep it faithful to the speaker.",
  it: "The audio is in Italian. Transcribe it in Italian with natural punctuation. Do not translate; keep it faithful to the speaker.",
  en: "Transcribe the audio in English with natural punctuation. Keep it faithful to the speaker.",
};

function promptFor(langCode: string): string | undefined {
  return LANGUAGE_PROMPTS[langCode];
}

// Split transcribed text into sentence-ish segments. Handles Latin (.?!…) and
// Hebrew punctuation; falls back to newlines / the whole blob.
function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/\n+|(?<=[.!?׃…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

// Assign estimated, strictly-increasing start times (~2.5 words/sec).
function toEstimatedSegments(sentences: string[]): TranscriptSegment[] {
  const WORDS_PER_SEC = 2.5;
  let cursor = 0;
  return sentences.map((text) => {
    const words = text.split(/\s+/).filter(Boolean).length || 1;
    const duration = Math.max(1.5, words / WORDS_PER_SEC);
    const seg = { text, start: Math.round(cursor * 100) / 100, duration: Math.round(duration * 100) / 100 };
    cursor += duration;
    return seg;
  });
}

async function callOpenAI(
  apiKey: string,
  model: string,
  audio: Blob,
  filename: string,
  langCode: string,
): Promise<{ text?: string; error?: string }> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", model);
  form.append("response_format", "json");
  if (langCode) form.append("language", langCode); // ISO-639-1 improves accuracy
  const prompt = promptFor(langCode);
  if (prompt) form.append("prompt", prompt);

  const resp = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { error: payload?.error?.message || `OpenAI transcription error ${resp.status}` };
  }
  return { text: typeof payload?.text === "string" ? payload.text : "" };
}

export const openaiProvider: TranscriptionProvider = {
  id: "openai",

  supports(source: MediaSource): boolean {
    return source.kind === "audio" && !!Deno.env.get("OPENAI_API_KEY");
  },

  async transcribe(source: MediaSource, opts: TranscribeOptions): Promise<TranscriptResult> {
    if (source.kind !== "audio") {
      return { transcript: [], language: "unknown", source: "none", steps: [], error: "openai: unsupported source" };
    }
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return { transcript: [], language: "unknown", source: "none", steps: [], error: "OPENAI_API_KEY is not set" };
    }

    const langCode = String(opts.language || "").toLowerCase().split(/[-_]/)[0];
    const steps: string[] = [];

    // Fetch the audio bytes (uploaded files live at a public Supabase URL).
    let audio: Blob;
    let filename = "audio.mp3";
    try {
      const audioResp = await fetch(source.audioUrl);
      if (!audioResp.ok) throw new Error(`fetch audio ${audioResp.status}`);
      audio = await audioResp.blob();
      const urlName = source.audioUrl.split("/").pop()?.split("?")[0];
      if (urlName && urlName.includes(".")) filename = urlName;
      steps.push("audio_fetched");
    } catch (e: any) {
      return {
        transcript: [], language: langCode || "unknown", source: "none", steps,
        error: `Could not download audio: ${e?.message || e}`,
      };
    }

    // Primary model, then cheaper fallback.
    let result = await callOpenAI(apiKey, PRIMARY_MODEL, audio, filename, langCode);
    let usedModel = PRIMARY_MODEL;
    steps.push("gpt4o_transcribe");
    if (result.error || !result.text) {
      steps.push(`primary_failed:${result.error || "empty"}`);
      result = await callOpenAI(apiKey, FALLBACK_MODEL, audio, filename, langCode);
      usedModel = FALLBACK_MODEL;
      steps.push("gpt4o_mini_transcribe");
    }

    if (result.error || !result.text) {
      return {
        transcript: [], language: langCode || "unknown", source: "none", steps,
        error: result.error || "Transcription returned no text.",
      };
    }

    const transcript = toEstimatedSegments(splitSentences(result.text));
    if (transcript.length === 0) {
      return { transcript: [], language: langCode || "unknown", source: "none", steps, error: "Empty transcript." };
    }

    steps.push("complete");
    return {
      transcript,
      language: langCode || "unknown",
      source: usedModel === PRIMARY_MODEL ? "openai_gpt4o_transcribe" : "openai_gpt4o_mini_transcribe",
      steps,
    };
  },
};
