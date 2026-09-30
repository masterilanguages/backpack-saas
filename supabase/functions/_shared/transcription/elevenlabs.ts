// ElevenLabs Scribe provider — handles BOTH `kind: "youtube"` (Scribe fetches
// the video itself via `source_url`) and `kind: "audio"` (a fetchable file URL).
//
// Why it comes first: Scribe returns a start/end time for EVERY word. Supadata
// only times ~5 s chunks, so sentence edges inside a chunk had to be estimated
// and replays leaked a word of the neighbouring sentence. Here each segment is
// built from whole words and starts/ends on a real word edge.
//
// Segments: words are joined until one ends a sentence (.?!… or Hebrew ׃), or
// until MAX_SEGMENT_SECONDS / a long pause, always cutting between two words.
import type {
  MediaSource,
  TranscribeOptions,
  TranscriptResult,
  TranscriptionProvider,
  TranscriptSegment,
} from "./types.ts";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v2";
const SENTENCE_END = /[.?!…׃]["'”»)]?$/;
const MAX_SEGMENT_SECONDS = 12; // past this, cut at the next word edge
const PAUSE_SECONDS = 1.2; // a silence this long also ends a segment

function normLang(tag: unknown): string {
  const t = String(tag || "").toLowerCase().split(/[-_]/)[0];
  return t === "iw" ? "he" : t;
}

// Scribe answers ISO 639-3 ("heb"); the app speaks ISO 639-1 ("he").
const ISO3_TO_1: Record<string, string> = { heb: "he", eng: "en", spa: "es", fra: "fr", por: "pt", ita: "it" };

const round = (n: number) => Math.round(n * 1000) / 1000;

function toSegments(words: any[]): TranscriptSegment[] {
  const spoken = (words || [])
    .filter((w: any) => w?.type === "word" && String(w?.text ?? "").trim())
    .map((w: any) => ({ text: String(w.text).trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 }));

  const out: TranscriptSegment[] = [];
  let cur: { words: string[]; start: number; end: number } | null = null;
  const flush = () => {
    if (cur) out.push({ text: cur.words.join(" "), start: round(cur.start), duration: round(Math.max(0, cur.end - cur.start)) });
    cur = null;
  };
  for (const w of spoken) {
    if (cur && (w.start - cur.end >= PAUSE_SECONDS || w.start - cur.start >= MAX_SEGMENT_SECONDS)) flush();
    if (!cur) cur = { words: [], start: w.start, end: w.end };
    cur.words.push(w.text);
    cur.end = Math.max(cur.end, w.end);
    if (SENTENCE_END.test(w.text)) flush();
  }
  flush();
  return out;
}

export const elevenlabsProvider: TranscriptionProvider = {
  id: "elevenlabs",

  supports(source: MediaSource): boolean {
    return (source.kind === "youtube" || source.kind === "audio") && !!Deno.env.get("ELEVENLABS_API_KEY");
  },

  async transcribe(source: MediaSource, opts: TranscribeOptions): Promise<TranscriptResult> {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return { transcript: [], language: "unknown", source: "none", steps: [], error: "ELEVENLABS_API_KEY is not set" };
    }
    const reqCode = normLang(opts.language);
    const steps: string[] = [];

    const form = new FormData();
    form.append("model_id", MODEL_ID);
    form.append(
      "source_url",
      source.kind === "youtube" ? `https://www.youtube.com/watch?v=${source.videoId}` : source.audioUrl,
    );
    if (reqCode) form.append("language_code", reqCode);
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.budgetMs ?? 70_000);
    let payload: any = {};
    try {
      const resp = await fetch(ELEVENLABS_STT_URL, {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: ctrl.signal,
      });
      payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = payload?.detail?.message || payload?.detail || `ElevenLabs error ${resp.status}`;
        steps.push(`scribe_failed:${resp.status}`);
        return { transcript: [], language: reqCode || "unknown", source: "none", steps, error: String(msg).slice(0, 300) };
      }
    } catch (e: any) {
      steps.push(e?.name === "AbortError" ? "scribe_timeout" : "scribe_network_error");
      return { transcript: [], language: reqCode || "unknown", source: "none", steps, error: `ElevenLabs: ${e?.message || e}` };
    } finally {
      clearTimeout(timer);
    }
    steps.push("scribe_words");

    const transcript = toSegments(payload?.words);
    if (!transcript.length) {
      return { transcript: [], language: reqCode || "unknown", source: "none", steps, error: "ElevenLabs returned no words." };
    }
    const returned = String(payload?.language_code || "").toLowerCase();
    steps.push("complete");
    return {
      transcript,
      language: ISO3_TO_1[returned] || normLang(returned) || reqCode || "unknown",
      source: "elevenlabs_scribe",
      steps,
    };
  },
};
