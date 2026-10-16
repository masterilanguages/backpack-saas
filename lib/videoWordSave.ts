// The two ways a word gets from a video into the Backpack (home page):
//   savePopupWord        the student taps a word and adds it;
//   saveRecommendedWords the lesson's recommended words, at the end of First listen.
// With the verb feature off they create exactly the rows they did before;
// with it on, a conjugated verb becomes (or joins) its infinitive's card.
//
// AI use: a word the student already met as a form of a verb card reuses that
// analysis (no call). Recommended words are saved at once as before, marked
// 'pending', and analyzed together in the background by lib/verbChecks (one
// call per lesson): closing the tab loses no word. The popup's own lookup and
// the chapter glosses are not touched.
//
// Pure (dependencies passed in): `deno test --unstable-sloppy-imports lib/videoWordSave.test.ts`.

import { markForVerbCheck, saveWordToBackpack, verbsEnabledFor, type SaveWordDeps, type SaveWordOptions, type SaveWordResult, type WordRow } from "./saveWord";
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
  opts: SaveWordOptions,
): Promise<{ added: number; aiCalls: number; results: SaveWordResult[]; pendingIds: string[] }> {
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

  const verbs = verbsEnabledFor(ctx.language, opts);
  let added = 0;
  const results: SaveWordResult[] = [];
  const pendingIds: string[] = [];
  for (const t of todo) {
    try {
      // A form already on one of the student's verb cards: joins it now (no call).
      const known = verbs ? knownAnalysisFromCards(ctx.words, t.r.hebrew || "") : undefined;
      if (known !== undefined) {
        results.push(await saveWordToBackpack({ row: t.row, surface: t.r.hebrew || "", sentence: t.sentence, knownAnalysis: known }, deps, opts));
      } else {
        // Saved at once as before; with verbs on, marked to be checked later.
        const row = markForVerbCheck(t.row, opts);
        const created = await deps.createWord(row);
        results.push({ word: created, outcome: verbs ? "pending" : "plain", aiCalls: 0, analysis: null });
        if (verbs && created?.id) pendingIds.push(String(created.id));
      }
      added++;
    } catch (e) {
      deps.log?.("[chapter] could not add recommended word", { word: t.r, error: e });
    }
  }
  return { added, aiCalls: 0, results, pendingIds };
}
