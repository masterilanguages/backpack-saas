// The chapter preparation, step by step, resumable (phase 2A).
//
//   1. Audio      ElevenLabs (+ YouTube captions as a second hearing) — reused
//                 from chapter_prep while audio_key is unchanged.
//   2. Sentences  lyric lines timed against the audio, or heard words grouped
//                 into sentences (≤ CHAPTER_MAX_SECONDS) — reused while
//                 segment_key is unchanged.
//   3. Translate  Claude, batches of 8 in parallel; each finished batch is
//                 stored at once, so a failure only redoes the missing ones.
//   4. Publish    chapter_content, complete chapters only, in one SQL
//                 transaction with the lease check (chapter_prep_publish).
//
// One run at a time holds the video (a lease); every write needs it. When a
// fresh transcription used up much of the run's time, translation continues
// in a new run (at most MAX_HOPS times; then the video is left
// pending_recovery for the automatic recovery of a later phase).
//
// Providers, Claude, the store and the clock are passed in (PrepDeps), so the
// whole flow is tested without paid calls.
import { classifyLlmError, isAccountLlmError } from "../../../lib/llmErrors.ts";
import { splitIntoSentences } from "../../../lib/chapterSentences.ts";
import { alignLinesToWords, fitSungLines, wordsFromFragments } from "../../../lib/lyricAlign.ts";
import { splitScriptLine } from "../../../lib/songLyrics.ts";
import { untranslatedCount } from "../../../lib/chapterPublish.ts";
import { audioKey, segmentKey, translateKey } from "../../../lib/chapterPrepKeys.ts";
import { QUALITY_MODEL, glossPrompt, GLOSS_SCHEMA, reviewGlossPrompt, REVIEW_GLOSS_SCHEMA, cleanGlosses, promptLanguageLabel } from "../../../lib/chapterPrompts.ts";
import { LeaseLostError, type PrepRow, type PrepStore } from "./store.ts";

// The WHOLE source is prepared: it is split into ~30 s episodes for learning
// (lib/chapterEpisodes), never shortened. This guard only stops runaway
// lengths (e.g. an hour-long upload); 15 minutes covers songs and stories.
export const CHAPTER_MAX_SECONDS = 900;
export const BATCH_SIZE = 8;
// Longer than the 135 s transcription budget; renewed by every write.
export const LEASE_SECONDS = 180;
export const MAX_HOPS = 4;
// A fresh transcription that took this long leaves translation to a new run,
// so the run stays well within the edge function's 150 s.
export const CONTINUE_AFTER_MS = 45_000;

const LANGUAGE_CODE: Record<string, string> = {
  english: "en", spanish: "es", hebrew: "he", french: "fr", portuguese: "pt", italian: "it",
};

export const stripCaptionNoise = (text: unknown) =>
  String(text || "").replace(/\[[^\]]{1,60}\]/g, " ").replace(/[♪♫🎵🎶]/g, " ").replace(/\s+/g, " ").trim();

export interface Heard {
  transcript: { text: string; start: number; duration: number }[];
  words?: { text: string; start: number; end: number }[];
  source: string;
  error?: string;
}

export interface PrepDeps {
  store: PrepStore;
  /** processed_transcript saved on the video (tells whether lyrics were imported). */
  loadSavedTranscript(videoId: string): Promise<any[]>;
  transcribe(videoId: string, languageCode: string): Promise<Heard>;
  fetchCaptions(videoId: string, languageCode: string): Promise<{ text: string; start: number; duration: number }[]>;
  /** Claude with the quality model (askJsonQuality); errors carry a `kind` for account failures. */
  translate(prompt: string, schema: Record<string, unknown>, model: string, maxTokens: number): Promise<any>;
  now(): number;
  log(message: string): void;
}

export interface PrepInput {
  videoId: string;
  language: string;
  force: boolean;
  continuing: boolean;
  ignoreLyrics?: boolean;
  /** Tests only: a short lease, to test expiry. */
  leaseSeconds?: number;
}

export type PrepOutcome =
  | { status: "busy" }
  | { status: "published" | "kept_existing"; sentences: any[] }
  | { status: "continue" }
  | { status: "pending_recovery"; reason: string }
  | { status: "failed" | "blocked"; errorKind: string; error: string }
  | { status: "lease_lost" };

/** Text the translation key fingerprints: the prompts and schemas exactly as sent. */
export function promptFingerprint(label: string) {
  return JSON.stringify([
    glossPrompt(label, ["{sentence}"]),
    reviewGlossPrompt(label, [{ text: "{heard}", alt: "{second hearing}" }]),
    GLOSS_SCHEMA,
    REVIEW_GLOSS_SCHEMA,
  ]);
}

function lyricLinesOf(saved: any[], ignoreLyrics?: boolean) {
  const savedLines = (Array.isArray(saved) ? saved : [])
    .map((segment: any) => {
      const { native, latin } = splitScriptLine(stripCaptionNoise(segment?.hebrew || segment?.text));
      return { text: native, transliteration: segment?.transliteration || latin, english: segment?.english || "", lyric: !!segment?.lyric, glued: !!latin };
    })
    .filter((line: any) => line.text);
  return !ignoreLyrics && (savedLines.some((l: any) => l.lyric) || savedLines.filter((l: any) => l.glued).length >= 3) ? savedLines : [];
}

function cutSentences(heard: Heard, lyricLines: any[]): any[] {
  const allFrags = (heard.transcript || [])
    .map((f) => ({ text: stripCaptionNoise(f.text), start: Number(f.start) || 0, end: (Number(f.start) || 0) + (Number(f.duration) || 0) }))
    .filter((f) => f.text);
  if (lyricLines.length) {
    const words = Array.isArray(heard.words) && heard.words.length ? heard.words : wordsFromFragments(allFrags);
    const timing = fitSungLines(alignLinesToWords(lyricLines.map((l: any) => l.text), words));
    return lyricLines
      .map((l: any, i: number) => ({
        start: timing[i].start,
        end: Math.min(timing[i].end, CHAPTER_MAX_SECONDS),
        hebrew: l.text, text: l.text, transliteration: l.transliteration, english: l.english,
      }))
      .filter((x: any) => x.start < CHAPTER_MAX_SECONDS - 1 && x.end > x.start);
  }
  return splitIntoSentences(allFrags.filter((f) => f.start < CHAPTER_MAX_SECONDS), CHAPTER_MAX_SECONDS)
    .map((x) => ({ start: x.start, end: x.end, hebrew: x.text, text: x.text, transliteration: "", english: "" }));
}

/** The stored batches applied to a copy of the sentences (same rules as before 2A). */
export function applyBatches(sentences: any[], batches: Record<string, any>, review: boolean) {
  const out = structuredClone(sentences);
  let fixed = 0;
  for (const [key, batch] of Object.entries(batches || {})) {
    const base = Number(key) * BATCH_SIZE;
    for (const it of batch?.items || []) {
      const x = out[base + Math.round(Number(it?.i))];
      if (!x || Math.round(Number(it?.i)) >= BATCH_SIZE) continue;
      const f = String(it?.fixed || "").trim();
      if (review && f && f !== x.text) {
        x.heard = x.text;
        x.text = x.hebrew = f;
        fixed++;
      }
      x.transliteration = x.transliteration || it.transliteration || "";
      x.english = x.english || it.english || "";
      x.words = cleanGlosses(it.words);
    }
  }
  return { sentences: out, fixed };
}

export async function runPrep(deps: PrepDeps, input: PrepInput): Promise<PrepOutcome> {
  const { store } = deps;
  const { videoId, language, force } = input;
  const tag = `[prepareChapter ${videoId}]`;
  const started = deps.now();
  const code = LANGUAGE_CODE[language] || language;
  const lease = input.leaseSeconds ?? LEASE_SECONDS;

  const row: PrepRow | null = await store.claim(videoId, language, lease, input.continuing);
  if (!row) {
    deps.log(`${tag} busy: another run holds it`);
    return { status: "busy" };
  }
  const token = row.lock_token;
  const save = async (patch: Record<string, unknown>) => {
    if (!(await store.save(videoId, token, patch, lease))) throw new LeaseLostError(videoId);
  };
  const end = async (status: "failed" | "blocked" | "queued" | "pending_recovery", kind: string | null, message: string | null, reason: string | null = null) => {
    await store.release(videoId, token, status, kind, message, reason).catch(() => false);
  };

  try {
    const lyricLines = lyricLinesOf(await deps.loadSavedTranscript(videoId), input.ignoreLyrics);
    const review = !lyricLines.length;

    // 1 · Audio
    const aKey = await audioKey(videoId, code);
    let heard: Heard | null = row.audio_key === aKey && row.transcript?.transcript?.length ? row.transcript : null;
    let captions: any[] | null = heard ? row.captions : null;
    let transcribedNow = false;
    if (heard) {
      deps.log(`${tag} transcript from cache`);
    } else {
      await save({ status: "transcribing" });
      const [res, caps] = await Promise.all([
        deps.transcribe(videoId, code),
        review ? deps.fetchCaptions(videoId, code).catch(() => []) : Promise.resolve(null),
      ]);
      if (!res?.transcript?.length) {
        await end("failed", "transcription", res?.error || "no timed transcript");
        return { status: "failed", errorKind: "transcription", error: res?.error || "no timed transcript" };
      }
      heard = { transcript: res.transcript, words: res.words, source: res.source };
      captions = caps;
      transcribedNow = true;
      await save({ audio_key: aKey, transcript: heard, captions, segment_key: null, sentences: null, translate_key: null, batches: {} });
    }
    // The second hearing is only used without lyrics; fetch it if a cached
    // transcript was made with lyrics that are gone now.
    if (review && !Array.isArray(captions)) {
      captions = await deps.fetchCaptions(videoId, code).catch(() => []);
      await save({ captions });
    }

    // 2 · Sentences
    const sKey = await segmentKey(aKey, lyricLines, CHAPTER_MAX_SECONDS);
    let sentences: any[] = row.segment_key === sKey && !transcribedNow && Array.isArray(row.sentences) ? row.sentences : [];
    let batches: Record<string, any> = {};
    if (sentences.length) {
      deps.log(`${tag} sentences from cache`);
    } else {
      sentences = cutSentences(heard!, lyricLines);
      if (!sentences.length) {
        await end("failed", "segmentation", "no sentences");
        return { status: "failed", errorKind: "segmentation", error: "no sentences" };
      }
      await save({ segment_key: sKey, sentences, translate_key: null, batches: {} });
    }

    // 3 · Translation
    const label = promptLanguageLabel(language);
    const secondHearing = review ? (captions || []).map((c: any) => [c.start, c.duration, stripCaptionNoise(c.text)]) : null;
    const tKey = await translateKey(sKey, { model: QUALITY_MODEL, prompts: promptFingerprint(label), batchSize: BATCH_SIZE, review, secondHearing });
    if (row.translate_key === tKey && row.segment_key === sKey && !transcribedNow) {
      batches = row.batches || {};
    }
    await save({ status: "translating", translate_key: tKey, batch_size: BATCH_SIZE, batches });

    if (transcribedNow && deps.now() - started > CONTINUE_AFTER_MS) return await continueLater();

    const altFor = (x: any) => (captions || [])
      .filter((c: any) => c.start < x.end + 0.5 && c.start + c.duration > x.start - 0.5)
      .map((c: any) => stripCaptionNoise(c.text)).filter(Boolean).join(" ");
    const total = Math.ceil(sentences.length / BATCH_SIZE);
    const missing = Array.from({ length: total }, (_, b) => b).filter((b) => !batches[String(b)]);
    if (Object.keys(batches).length) deps.log(`${tag} ${total - missing.length} of ${total} batches from cache`);
    const failedKinds = new Set<string>();
    let leaseLost = false;
    await Promise.all(missing.map(async (b) => {
      const batch = sentences.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      try {
        const t = review
          ? await deps.translate(reviewGlossPrompt(label, batch.map((x: any) => ({ text: x.text, alt: altFor(x) }))), REVIEW_GLOSS_SCHEMA, QUALITY_MODEL, 12000)
          : await deps.translate(glossPrompt(label, batch.map((x: any) => x.text)), GLOSS_SCHEMA, QUALITY_MODEL, 8000);
        const kept = { items: Array.isArray(t?.items) ? t.items : [] };
        if (await store.addBatch(videoId, token, tKey, b, kept, lease)) batches[String(b)] = kept;
        else leaseLost = true;
      } catch (e: any) {
        const kind = e?.kind || classifyLlmError(e);
        failedKinds.add(kind);
        deps.log(`${tag} translation batch ${b} failed (${kind}): ${String(e?.message || e).slice(0, 200)}`);
      }
    }));
    if (leaseLost) throw new LeaseLostError(videoId);
    const why = Array.from(failedKinds).join(", ");
    const account = Array.from(failedKinds).find((k) => isAccountLlmError(k as any));
    if (account) {
      const msg = `translation stopped: ${why}; ${Object.keys(batches).length} of ${total} batches kept`;
      await end("blocked", account, msg);
      return { status: "blocked", errorKind: account, error: msg };
    }
    if (failedKinds.size) {
      const msg = `${total - Object.keys(batches).length} of ${total} batches failed (${why}); the rest are kept`;
      await end("failed", Array.from(failedKinds)[0], msg);
      return { status: "failed", errorKind: Array.from(failedKinds)[0], error: msg };
    }

    // 4 · Publish (complete only; the SQL function checks it again)
    const { sentences: done, fixed } = applyBatches(sentences, batches, review);
    const gaps = untranslatedCount(done);
    if (gaps) {
      const msg = `not published: ${gaps} of ${done.length} sentences untranslated`;
      await end("failed", "incomplete", msg);
      return { status: "failed", errorKind: "incomplete", error: msg };
    }
    await save({ status: "publishing" });
    const source = `${heard!.source || ""}${lyricLines.length ? "+lyrics" : ""}`;
    const outcome = await store.publish(videoId, token, done, source, force);
    deps.log(`${tag} ${outcome}: ${done.length} sentences (${heard!.source}; second hearing: ${captions?.length ? "youtube captions" : "none"}; ${fixed} lines fixed)`);
    return { status: outcome, sentences: done };
  } catch (e: any) {
    if (e instanceof LeaseLostError) {
      deps.log(`${tag} lease lost: stopped without writing`);
      await end("failed", "lease_lost", "lease lost");
      return { status: "lease_lost" };
    }
    const kind = e?.kind || classifyLlmError(e);
    deps.log(`${tag} failed (${kind}): ${e?.message || e}`);
    await end("failed", kind, String(e?.message || e));
    return { status: "failed", errorKind: kind, error: String(e?.message || e) };
  }

  async function continueLater(): Promise<PrepOutcome> {
    if (row!.hops >= MAX_HOPS) {
      const reason = `max continuations reached (${MAX_HOPS})`;
      await end("pending_recovery", null, null, reason);
      deps.log(`${tag} pending recovery: ${reason}`);
      return { status: "pending_recovery", reason };
    }
    await end("queued", null, null);
    deps.log(`${tag} continuing in a new run (hop ${row!.hops + 1} of ${MAX_HOPS})`);
    return { status: "continue" };
  }
}
