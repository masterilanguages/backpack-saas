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
  lemmaKey, occurrenceFrom, parseVerbAnalysis, plainSpelling, verbAnalysisPrompt,
  VERB_ANALYSIS_SCHEMA, type VerbAnalysis, type VerbOccurrence,
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
  | "analysis-failed"  // AI error / timeout → saved as today
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
      deps.log?.("[saveWord] verb analysis failed, saving the word as it is", e);
      return plain("analysis-failed", aiCalls);
    }
  }
  if (!analysis) return plain("not-verb", aiCalls);

  // 2. A verb: one card per infinitive, this form added to it.
  const card: VerbCardFields = {
    word: analysis.lemma,
    phonetic: analysis.lemma_phonetic || analysis.lemma,
    translation: analysis.lemma_meaning || String(row.translation || ""),
    language,
    lemma_key: lemmaKey(analysis.lemma, analysis.binyan),
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
  const saved = await deps.saveVerbOccurrence(card, occurrence);
  return { word: saved.word, outcome: saved.created ? "verb-created" : "verb-merged", aiCalls, analysis };
}
