// prepareChapter — makes a video's chapter sentences (Sentence discovery) on
// the server, right when the video is added in Media, so no student waits on
// "Preparing the sentences…". Same steps the app used to run on first open:
//
//   1. ElevenLabs (via transcribeMediaSource) hears the audio, word by word.
//   2. Songs with imported lyrics: the lyric lines are timed word by word
//      against what was heard (lib/lyricAlign). Otherwise the heard words are
//      grouped into sentences (lib/chapterSentences).
//   3. Claude (Opus) adds transliteration, English and a gloss per word.
//   4. The sentences are saved in chapter_content (shared by all students).
//
// Request: { videoId, language: "hebrew", force?: boolean }
// Replies at once ({ status: "ready" | "started" }) and works in the
// background; the app sees the result when the chapter_content row appears.
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { transcribeMediaSource } from "../_shared/transcription/index.ts";
import { fetchYoutubeCaptions } from "../_shared/transcription/supadata.ts";
import { askJsonQuality } from "../_shared/llm.ts";
import { splitIntoSentences } from "../../../lib/chapterSentences.ts";
import { alignLinesToWords, fitSungLines, wordsFromFragments } from "../../../lib/lyricAlign.ts";
import { splitScriptLine } from "../../../lib/songLyrics.ts";
import { QUALITY_MODEL, glossPrompt, GLOSS_SCHEMA, reviewGlossPrompt, REVIEW_GLOSS_SCHEMA, cleanGlosses, promptLanguageLabel } from "../../../lib/chapterPrompts.ts";

// A chapter's content is at most 3.5 minutes; longer videos use the first 3:30.
const CHAPTER_MAX_SECONDS = 210;

const LANGUAGE_CODE: Record<string, string> = {
  english: "en", spanish: "es", hebrew: "he", french: "fr", portuguese: "pt", italian: "it",
};

const stripCaptionNoise = (text: unknown) =>
  String(text || "").replace(/\[[^\]]{1,60}\]/g, " ").replace(/[♪♫🎵🎶]/g, " ").replace(/\s+/g, " ").trim();

async function prepare(videoId: string, language: string, force: boolean, opts: { dryRun?: boolean; ignoreLyrics?: boolean } = {}) {
  const db = serviceClient();
  const tag = `[prepareChapter ${videoId}]`;

  // The saved transcript tells us whether published lyrics were imported.
  let saved: any[] = [];
  for (const table of ["media_library", "user_saved_video"]) {
    const { data } = await db.from(table).select("processed_transcript").eq("video_id", videoId).limit(1);
    if (Array.isArray(data?.[0]?.processed_transcript) && data[0].processed_transcript.length) {
      saved = data[0].processed_transcript;
      break;
    }
  }
  const savedLines = saved
    .map((segment: any) => {
      const { native, latin } = splitScriptLine(stripCaptionNoise(segment?.hebrew || segment?.text));
      return { text: native, transliteration: segment?.transliteration || latin, english: segment?.english || "", lyric: !!segment?.lyric, glued: !!latin };
    })
    .filter((line: any) => line.text);
  const lyricLines = !opts.ignoreLyrics && (savedLines.some((l: any) => l.lyric) || savedLines.filter((l: any) => l.glued).length >= 3) ? savedLines : [];

  // 1 · Hear the audio (ElevenLabs first, Supadata as fallback) and, in
  // parallel, YouTube's own captions as a second hearing (not needed when the
  // text comes from imported lyrics).
  const code = LANGUAGE_CODE[language] || language;
  const [res, captions]: [any, any[]] = await Promise.all([
    transcribeMediaSource({ kind: "youtube", videoId }, { language: code }),
    lyricLines.length ? Promise.resolve([]) : fetchYoutubeCaptions(videoId, code).catch(() => []),
  ]);
  const allFrags = (res?.transcript || [])
    .map((f: any) => ({ text: stripCaptionNoise(f.text), start: Number(f.start) || 0, end: (Number(f.start) || 0) + (Number(f.duration) || 0) }))
    .filter((f: any) => f.text);
  if (!allFrags.length) throw new Error(res?.error || "no timed transcript");

  // 2 · Sentences with their times.
  let sentences: any[];
  if (lyricLines.length) {
    const words = Array.isArray(res?.words) && res.words.length ? res.words : wordsFromFragments(allFrags);
    const timing = fitSungLines(alignLinesToWords(lyricLines.map((l: any) => l.text), words));
    sentences = lyricLines
      .map((l: any, i: number) => ({
        start: timing[i].start,
        end: Math.min(timing[i].end, CHAPTER_MAX_SECONDS),
        hebrew: l.text, text: l.text, transliteration: l.transliteration, english: l.english,
      }))
      .filter((x: any) => x.start < CHAPTER_MAX_SECONDS - 1 && x.end > x.start);
  } else {
    sentences = splitIntoSentences(allFrags.filter((f: any) => f.start < CHAPTER_MAX_SECONDS), CHAPTER_MAX_SECONDS)
      .map((x) => ({ start: x.start, end: x.end, hebrew: x.text, text: x.text, transliteration: "", english: "" }));
  }
  if (!sentences.length) throw new Error("no sentences");

  // 3 · Transliteration + English + word glosses, batches of 8 in parallel.
  // Heard text (no imported lyrics) is first reviewed against the second
  // hearing: clearly misheard words are fixed; what ElevenLabs heard is kept
  // in `heard` for every line that changed.
  const label = promptLanguageLabel(language);
  const review = !lyricLines.length;
  const altFor = (x: any) => captions
    .filter((c: any) => c.start < x.end + 0.5 && c.start + c.duration > x.start - 0.5)
    .map((c: any) => stripCaptionNoise(c.text)).filter(Boolean).join(" ");
  let fixedCount = 0;
  const batches: any[][] = [];
  for (let b = 0; b < sentences.length; b += 8) batches.push(sentences.slice(b, b + 8));
  await Promise.all(batches.map(async (batch) => {
    try {
      const t = review
        ? await askJsonQuality(reviewGlossPrompt(label, batch.map((x: any) => ({ text: x.text, alt: altFor(x) }))), REVIEW_GLOSS_SCHEMA, QUALITY_MODEL, 12000)
        : await askJsonQuality(glossPrompt(label, batch.map((x: any) => x.text)), GLOSS_SCHEMA, QUALITY_MODEL, 8000);
      for (const it of t?.items || []) {
        const x = batch[Math.round(Number(it?.i))];
        if (!x) continue;
        const fixed = String(it?.fixed || "").trim();
        if (review && fixed && fixed !== x.text) {
          x.heard = x.text;
          x.text = x.hebrew = fixed;
          fixedCount++;
        }
        x.transliteration = x.transliteration || it.transliteration || "";
        x.english = x.english || it.english || "";
        x.words = cleanGlosses(it.words);
      }
    } catch (e) {
      console.warn(`${tag} translation batch failed`, e);
    }
  }));
  if (opts.dryRun) return { sentences, source: res?.source, captions: captions.length, fixed: fixedCount };
  // Nothing translated (e.g. the AI account is out of credit): don't save a
  // chapter without transliteration or English — it can be prepared again.
  if (!sentences.some((x: any) => x.transliteration || x.english)) throw new Error("no sentence could be translated");

  // 4 · Save (replacing an older version only when asked to).
  if (force) await db.from("chapter_content").delete().eq("video_id", videoId);
  const { error } = await db.from("chapter_content").insert({
    video_id: videoId,
    language,
    sentences,
    source: `${res?.source || ""}${lyricLines.length ? "+lyrics" : ""}`,
  });
  if (error) throw new Error(`save failed: ${error.message}`);
  console.log(`${tag} ready: ${sentences.length} sentences (${res?.source}; second hearing: ${captions.length ? "youtube captions" : "none"}; ${fixedCount} lines fixed)`);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const body = await req.json().catch(() => ({}));
  const videoId = String(body?.videoId || "").trim();
  const language = String(body?.language || "hebrew").toLowerCase();
  const force = body?.force === true;
  // Testing: run the pipeline and return the result without saving anything.
  if (body?.dryRun === true) {
    try {
      return json(await prepare(videoId, language, false, { dryRun: true, ignoreLyrics: body?.ignoreLyrics === true }));
    } catch (e: any) {
      return json({ error: e?.message || String(e) }, 500);
    }
  }
  if (!/^[\w-]{6,20}$/.test(videoId)) return json({ error: "Provide a YouTube videoId" }, 400);

  if (!force) {
    const { data } = await serviceClient().from("chapter_content").select("video_id").eq("video_id", videoId).limit(1);
    if (data?.length) return json({ status: "ready" });
  }

  const work = prepare(videoId, language, force).catch((e) => console.error(`[prepareChapter ${videoId}] failed`, e));
  // Keep working after the reply (Supabase background task).
  (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  return json({ status: "started" }, 202);
});
