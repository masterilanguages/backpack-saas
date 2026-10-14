// Cache keys of a chapter's preparation steps (chapter_prep, migration 2100).
// Each step's stored result is reused while its key is unchanged:
//
//   audio_key     what was heard: video + language + transcription engine.
//                 Imported lyrics are NOT part of it, so importing or editing
//                 lyrics never pays for a new transcription.
//   segment_key   the sentences: audio_key + imported lyric lines + splitter
//                 version + the chapter length limit.
//   translate_key the translations: segment_key + model + the exact prompt
//                 and schema text + batch size + the second hearing used for
//                 review. Editing a prompt changes the key by itself, without
//                 anyone having to bump a version.
//
// Pure, no imports: runs in the edge function (Deno) and in tests.

// Bump when the transcription providers change what they return.
export const TRANSCRIBE_VERSION = "transcribe/1 elevenlabs-scribe_v2>openai>supadata";
// Bump when lib/chapterSentences or lib/lyricAlign change how lines are cut or timed.
export const SEGMENT_VERSION = "segment/1 chapterSentences+lyricAlign";

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const audioKey = (videoId: string, languageCode: string) =>
  sha256(["audio", TRANSCRIBE_VERSION, videoId, languageCode]);

export const segmentKey = (
  audio: string,
  lyricLines: { text: string; transliteration?: string; english?: string }[],
  maxSeconds: number,
) => sha256(["segment", SEGMENT_VERSION, audio, maxSeconds, lyricLines.map((l) => [l.text, l.transliteration || "", l.english || ""])]);

export const translateKey = (
  segment: string,
  opts: { model: string; prompts: string; batchSize: number; review: boolean; secondHearing: unknown },
) => sha256(["translate", segment, opts.model, opts.prompts, opts.batchSize, opts.review, opts.review ? opts.secondHearing : null]);
