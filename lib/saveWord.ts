// One way to save a word to the Backpack, wherever it comes from.
//
// A conjugated verb becomes (or joins) one card per infinitive: the card's
// word/phonetic/translation are the infinitive's, and the exact word the
// student met is kept in verb_forms with its grammar, sentence and video
// (save_verb_occurrence, migration 2200 — atomic, so two saves of the same
// verb never make two cards). Every other word is saved exactly as today.
//
// AI use: an analysis the caller already has (a chapter gloss, the word
// popup's own call) is used as is; otherwise one call per word, remembered
// for the session (same word in the same sentence → no second call, and two
// saves at once share one call).
//
// Pure (dependencies are passed in) so it is tested without network:
// `deno test --unstable-sloppy-imports lib/saveWord.test.ts`. The app's
// dependencies are in lib/saveWordDeps.

import {
  keyOfAnalysis, occurrenceFrom, parseVerbAnalysis, plainSpelling, verbAnalysisPrompt, verbBatchPrompt,
  VERB_ANALYSIS_SCHEMA, VERB_BATCH_SCHEMA, type VerbAnalysis, type VerbOccurrence,
} from "./verbs";

/** A word row as the callers build it today (base44 Word.create data). */
export type WordRow = Record<string, any> & { word: string; language?: string | null };

/** Fields of the infinitive's card sent to save_verb_occurrence. */
export type VerbCardFields = {
  word: string;
  phonetic: string;
  translation: string;
  language: string;
  lemma_key: string;
  category?: string | null;
  learn_status?: string | null;
  times_practiced?: number | null;
  mastered?: boolean | null;
  image_url?: string | null;
  mnemonic_explanation?: string | null;
};

export type SaveWordInput = {
  row: WordRow;
  /** The word as written in the sentence (default: row.word). */
  surface?: string;
  /** The sentence it came from (default: row.example_sentence). */
  sentence?: string | null;
  /**
   * The model's answer about this word from a call the caller already made
   * (same shape as VERB_ANALYSIS_SCHEMA). Given → no AI call here.
   * `{ is_verb: false }` or null means "known not to be a verb".
   */
  knownAnalysis?: any;
  /** Fixed vocabulary lists (colors, months…): never analyzed. */
  skipAnalysis?: boolean;
};

export type SaveWordDeps = {
  createWord(row: WordRow): Promise<any>;
  saveVerbOccurrence(card: VerbCardFields, occurrence: VerbOccurrence): Promise<{ word: any; created: boolean }>;
  /** One structured AI call (the app uses the quality model). */
  analyze(prompt: string, schema: Record<string, unknown>): Promise<any>;
  /** "hebrew" → "Hebrew" (lib/language languageLabel). */
  label?(language: string): string;
  /** lib/chapterPrompts translitRules. */
  translitRules?(label: string): string;
  log?(message: string, error?: unknown): void;
  /**
   * Called once a verb card is saved: starts preparing its conjugation table
   * in the background (never awaited, so saving is not slowed down).
   */
  onVerbCard?(card: any): void;
};

export type SaveWordOptions = {
  /** Languages where verbs are normalized (feature flag). Empty = off everywhere. */
  enabledLanguages: string[];
  /** Longest wait for the analysis before saving the word as today. */
  timeoutMs?: number;
};

export type SaveWordOutcome =
  | "plain"            // not analyzed (flag off, other language, fixed list)
  | "not-verb"         // analyzed: not a verb → saved as today
  | "analysis-failed"  // AI error / timeout → saved as today, checked later (verb_check)
  | "pending"          // saved as today without waiting, checked later (lib/verbChecks)
  | "verb-created"     // new infinitive card
  | "verb-merged";     // added to the student's card of that infinitive

export type SaveWordResult = { word: any; outcome: SaveWordOutcome; aiCalls: number; analysis: VerbAnalysis | null };

// ------------------------------------------------------------ session cache

const CACHE_MAX = 300;
const cache = new Map<string, Promise<VerbAnalysis | null>>();

const cacheKey = (language: string, surface: string, sentence: string) =>
  `${language}|${plainSpelling(surface)}|${plainSpelling(sentence)}`;

function remember(key: string, p: Promise<VerbAnalysis | null>) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, p);
}

/** Tests only. */
export function clearVerbAnalysisCache() {
  cache.clear();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`verb analysis timed out after ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// ------------------------------------------------------------------- saving

export async function saveWordToBackpack(input: SaveWordInput, deps: SaveWordDeps, opts: SaveWordOptions): Promise<SaveWordResult> {
  const { row } = input;
  const language = String(row.language || "hebrew").toLowerCase();
  const surface = String(input.surface ?? row.word ?? "").trim();
  const sentence = String(input.sentence ?? row.example_sentence ?? "").trim();
  const plain = async (outcome: SaveWordOutcome, aiCalls = 0): Promise<SaveWordResult> =>
    ({ word: await deps.createWord(row), outcome, aiCalls, analysis: null });

  if (input.skipAnalysis || !surface || !opts.enabledLanguages.map((l) => l.toLowerCase()).includes(language)) {
    return plain("plain");
  }

  // 1. The analysis: given by the caller, remembered, or one AI call.
  let aiCalls = 0;
  let analysis: VerbAnalysis | null;
  if (input.knownAnalysis !== undefined) {
    analysis = parseVerbAnalysis(input.knownAnalysis, language, surface);
  } else {
    const key = cacheKey(language, surface, sentence);
    let pending = cache.get(key);
    if (!pending) {
      aiCalls = 1;
      const label = deps.label ? deps.label(language) : language;
      const prompt = verbAnalysisPrompt(label, surface, sentence || surface, deps.translitRules ? deps.translitRules(label) : "");
      pending = deps.analyze(prompt, VERB_ANALYSIS_SCHEMA).then((raw) => parseVerbAnalysis(raw, language, surface));
      remember(key, pending);
      // A failed call is forgotten, so a later save can try again.
      pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    }
    try {
      analysis = await withTimeout(pending, opts.timeoutMs ?? 10_000);
    } catch (e) {
      // Saved as today, marked for a later check (lib/verbChecks), so a slow
      // or failed analysis never loses the word nor leaves it unanalyzed.
      deps.log?.("[saveWord] verb analysis failed, saving the word as it is (checked later)", e);
      return { word: await deps.createWord({ ...row, verb_check: "pending" }), outcome: "analysis-failed", aiCalls, analysis: null };
    }
  }
  if (!analysis) return plain("not-verb", aiCalls);

  // 2. A verb: one card per infinitive, this form added to it.
  const { card, occurrence } = verbCardFor(row, analysis, surface, sentence, language);
  const saved = await deps.saveVerbOccurrence(card, occurrence);
  try { deps.onVerbCard?.(saved.word); } catch { /* never blocks the save */ }
  return { word: saved.word, outcome: saved.created ? "verb-created" : "verb-merged", aiCalls, analysis };
}

/** The infinitive's card fields and this form's occurrence, from a word row and its analysis. */
export function verbCardFor(row: WordRow, analysis: VerbAnalysis, surface: string, sentence: string | null, language: string) {
  const card: VerbCardFields = {
    word: analysis.lemma,
    phonetic: analysis.lemma_phonetic || analysis.lemma,
    translation: analysis.lemma_meaning || String(row.translation || ""),
    language,
    lemma_key: keyOfAnalysis(analysis),
    category: row.category ?? "wordbank",
    learn_status: row.learn_status ?? null,
    times_practiced: row.times_practiced ?? 0,
    mastered: row.mastered ?? false,
    image_url: row.image_url ?? null,
    mnemonic_explanation: row.mnemonic_explanation ?? null,
  };
  const occurrence = occurrenceFrom(surface, {
    ...analysis,
    // The caller's contextual translation/transliteration of the word wins
    // when the analysis has none.
    translation: analysis.translation || String(row.translation || ""),
    phonetic: analysis.phonetic || (row.phonetic && row.phonetic !== row.word ? String(row.phonetic) : ""),
  }, {
    sentence: sentence || null,
    video_id: row.source_video_id ?? null,
    video_title: row.source_video_title ?? null,
  });
  return { card, occurrence };
}

/** Whether verbs of this word's language are normalized (the feature flag). */
export const verbsEnabledFor = (language: string | null | undefined, opts: SaveWordOptions) =>
  opts.enabledLanguages.map((l) => l.toLowerCase()).includes(String(language || "hebrew").toLowerCase());

/**
 * For saves that don't wait for an analysis (typed words, lists, a lesson's
 * recommended words): the row is saved at once, exactly as before, and marked
 * for lib/verbChecks to analyze in the background. Unchanged when the
 * feature is off for its language.
 */
export function markForVerbCheck<T extends Record<string, any>>(row: T, opts: SaveWordOptions): T {
  return verbsEnabledFor(row.language, opts) && row.word ? { ...row, verb_check: "pending" } : row;
}

/** The session's answer for a word in a sentence, if one was asked (lib/verbChecks). */
export function cachedAnalysis(language: string, surface: string, sentence: string): Promise<VerbAnalysis | null> | undefined {
  return cache.get(cacheKey(String(language || "hebrew").toLowerCase(), surface, sentence));
}

// ------------------------------------------------------------ several words

export type BatchItem = { surface: string; sentence: string; language: string };

/**
 * One AI call for several words (a lesson's recommended words). Answers are
 * kept in the session cache, so a later save of the same word in the same
 * sentence costs nothing. `results[i]` is the model's raw answer for
 * items[i] (null when it gave none); `failed` when the call itself failed.
 * Words of languages that are not enabled, or already remembered, are not
 * sent; no call at all when nothing is left.
 */
export async function analyzeWordsTogether(items: BatchItem[], deps: SaveWordDeps, opts: SaveWordOptions & { batchTimeoutMs?: number }):
  Promise<{ aiCalls: number; failed: boolean; results: (any | null | undefined)[] }> {
  const enabled = opts.enabledLanguages.map((l) => l.toLowerCase());
  const results: (any | null | undefined)[] = items.map(() => undefined);
  const ask: number[] = [];
  items.forEach((it, i) => {
    const lang = String(it.language || "hebrew").toLowerCase();
    if (!it.surface || !enabled.includes(lang)) return;
    if (cache.has(cacheKey(lang, it.surface, it.sentence))) return;
    ask.push(i);
  });
  if (!ask.length) return { aiCalls: 0, failed: false, results };
  const lang = String(items[ask[0]].language || "hebrew").toLowerCase();
  const label = deps.label ? deps.label(lang) : lang;
  const prompt = verbBatchPrompt(label, ask.map((i) => ({ word: items[i].surface, sentence: items[i].sentence || items[i].surface })),
    deps.translitRules ? deps.translitRules(label) : "");
  try {
    const raw = await withTimeout(deps.analyze(prompt, VERB_BATCH_SCHEMA), opts.batchTimeoutMs ?? 30_000);
    const byI = new Map<number, any>();
    for (const r of Array.isArray(raw?.items) ? raw.items : []) {
      if (Number.isInteger(r?.i) && r.i >= 0 && r.i < ask.length && !byI.has(r.i)) byI.set(r.i, r);
    }
    ask.forEach((itemIndex, n) => {
      const it = items[itemIndex];
      const answer = byI.get(n) ?? null;
      results[itemIndex] = answer;
      if (answer) {
        const itLang = String(it.language || "hebrew").toLowerCase();
        remember(cacheKey(itLang, it.surface, it.sentence), Promise.resolve(parseVerbAnalysis(answer, itLang, it.surface)));
      }
    });
    return { aiCalls: 1, failed: false, results };
  } catch (e) {
    deps.log?.("[saveWord] batch verb analysis failed, saving the words as they are", e);
    return { aiCalls: 1, failed: true, results };
  }
}
