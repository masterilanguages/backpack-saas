// The two ways a word gets from a video into the Backpack (home page):
//   savePopupWord        the student taps a word and adds it;
//   saveRecommendedWords the lesson's recommended words, at the end of First listen.
// With the verb feature off they create exactly the rows they did before;
// with it on, a conjugated verb becomes (or joins) its infinitive's card.
//
// AI use: a word the student already met as a form of a verb card reuses that
// analysis (no call); recommended words are analyzed together (one call per
// lesson, not one per word). The popup's own lookup and the chapter glosses
// are not touched.
//
// Pure (dependencies passed in): `deno test --unstable-sloppy-imports lib/videoWordSave.test.ts`.

import { analyzeWordsTogether, saveWordToBackpack, type SaveWordDeps, type SaveWordOptions, type SaveWordResult, type WordRow } from "./saveWord";
import { knownAnalysisFromCards } from "./verbCard";

export type VideoRef = { video_id?: string | null; title?: string | null } | null | undefined;

export type PopupWord = { clean: string; translation?: string; phonetic?: string; sentence?: string | null };

/** The row savePopupWord has always created. */
export function popupWordRow(p: PopupWord, language: string, video: VideoRef): WordRow {
  return {
    word: p.clean,
    translation: p.translation || "",
    phonetic: p.phonetic || p.clean,
    category: "wordbank",
    language,
    times_practiced: 0,
    mastered: false,
    // The sentence the word came from travels with the card, so the
    // flashcard can play it back.
    example_sentence: p.sentence as any,
    // Which video it came from -> its own deck in the Backpack menu.
    source_video_id: video?.video_id || null,
    source_video_title: video?.title || null,
    // Enters Backpack as New: the student decides Learn / Skip later.
    learn_status: "new",
  };
}

export async function savePopupWord(
  p: PopupWord,
  ctx: { language: string; video: VideoRef; words: any[] },
  deps: SaveWordDeps,
  opts: SaveWordOptions,
): Promise<SaveWordResult> {
  return saveWordToBackpack({
    row: popupWordRow(p, ctx.language, ctx.video),
    surface: p.clean,
    sentence: p.sentence ?? null,
    knownAnalysis: knownAnalysisFromCards(ctx.words, p.clean),
  }, deps, opts);
}

export type Recommended = { hebrew?: string; phonetic?: string; meaning?: string };

/**
 * The lesson adds its recommended words to Backpack as New, skipping the ones
 * the student already has (same rule as before: by spelling of word).
 */
export async function saveRecommendedWords(
  ctx: {
    recommended: Recommended[];
    words: any[];
    segments: any[];
    language: string;
    video: VideoRef;
    /** Spelling used to compare (the page's normHe). */
    norm: (t: string) => string;
  },
  deps: SaveWordDeps,
  opts: SaveWordOptions & { batchTimeoutMs?: number },
): Promise<{ added: number; aiCalls: number; results: SaveWordResult[] }> {
  const { norm } = ctx;
  const have = new Set(ctx.words.map((w: any) => norm(w.word || "")).filter(Boolean));
  const todo: { r: Recommended; row: WordRow; sentence: string | null }[] = [];
  for (const r of ctx.recommended) {
    const key = norm(r.hebrew || "");
    if (!key || have.has(key)) continue;
    have.add(key);
    const seg = ctx.segments.find((sg: any) => norm(sg.hebrew || sg.text || "").includes(key));
    const sentence = seg ? seg.hebrew || seg.text : null;
    todo.push({
      r, sentence,
      row: {
        word: r.hebrew as string,
        phonetic: r.phonetic || (r.hebrew as string),
        translation: r.meaning || "",
        category: "wordbank",
        language: ctx.language,
        times_practiced: 0,
        mastered: false,
        example_sentence: sentence as any,
        source_video_id: ctx.video?.video_id || null,
        source_video_title: ctx.video?.title || null,
        learn_status: "new",
      },
    });
  }

  // Analyses: from the student's own verb cards, else one call for the rest.
  const fromCards = todo.map((t) => knownAnalysisFromCards(ctx.words, t.r.hebrew || ""));
  const askIdx = todo.map((_, i) => i).filter((i) => fromCards[i] === undefined);
  const batch = await analyzeWordsTogether(
    askIdx.map((i) => ({ surface: todo[i].r.hebrew || "", sentence: todo[i].sentence || "", language: ctx.language })),
    deps, opts,
  );
  const known: any[] = fromCards.slice();
  askIdx.forEach((i, n) => { known[i] = batch.results[n]; });

  let added = 0;
  const results: SaveWordResult[] = [];
  for (let i = 0; i < todo.length; i++) {
    const t = todo[i];
    try {
      const res = await saveWordToBackpack({
        row: t.row,
        surface: t.r.hebrew || "",
        sentence: t.sentence,
        // Never a second call per word: no answer (or a failed batch) = saved as today.
        knownAnalysis: known[i] === undefined ? null : known[i],
      }, deps, opts);
      results.push(res);
      added++;
    } catch (e) {
      deps.log?.("[chapter] could not add recommended word", { word: t.r, error: e });
    }
  }
  return { added, aiCalls: batch.aiCalls, results };
}
