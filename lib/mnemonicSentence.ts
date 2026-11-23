// Example sentences on a mnemonic card: a native speaker writes one, a second
// fast call checks it, and only the checked sentence (with the transliteration
// and English that match THAT sentence) is saved or shown.
//
// Hebrew target: everyday spoken Israeli Hebrew. כלב (kelev, dog) →
// "יש לי כלב שחור" / yesh li kelev shachor / "I have a black dog".
// Adjective after the noun, agreement, no Biblical and no word-for-word English.

import { languageLabel } from "./language";
import { plainSpelling } from "./verbs";

/** Cheap model. invoke-llm honours `model`; haiku is the fast default in this app. */
export const FAST_SENTENCE_MODEL = "claude-haiku-4-5";

export const SENTENCE_CACHE_VERSION = "sentences-v1";

/** The sentence a native speaker accepts for כלב. Tests and the prompt both use it. */
export const KELEV_SENTENCE = {
  word: "כלב",
  phonetic: "kelev",
  meaning: "dog",
  language: "hebrew",
  sentence: "יש לי כלב שחור",
  transliteration: "yesh li kelev shachor",
  english: "I have a black dog",
} as const;

export type SentenceInput = {
  language?: string | null;
  word?: string | null;
  phonetic?: string | null;
  meaning?: string | null;
  lemma?: string | null;
  lemmaPhonetic?: string | null;
  count?: number;
};

export type SentenceDraft = {
  sentence?: string;
  hebrew_sentence?: string;
  transliteration?: string;
  english?: string;
  words?: { hebrew?: string; word?: string; meaning?: string }[];
};

export type SentenceReview = SentenceDraft & { ok?: boolean };

export type CardExample = {
  hebrew_sentence: string;
  transliteration: string;
  english: string;
  words?: { hebrew: string; word: string; meaning: string }[];
};

export type LlmInvoke = (args: {
  prompt: string;
  response_json_schema?: unknown;
  model?: string;
  max_tokens?: number;
}) => Promise<any>;

const clip = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const compact = (s: string) => s.replace(/\s+/g, "");

function targetOf(input: SentenceInput) {
  const language = String(input.language || "hebrew").toLowerCase();
  const lemma = clip(input.lemma, 60);
  const lemmaPhonetic = clip(input.lemmaPhonetic, 60);
  return {
    language,
    label: languageLabel(language),
    hebrew: language === "hebrew",
    word: lemma || clip(input.word, 60) || clip(input.phonetic, 60),
    phonetic: lemmaPhonetic || clip(input.phonetic, 60) || clip(input.word, 60),
    meaning: clip(input.meaning, 120),
    count: input.count === 1 ? 1 : 3,
  };
}

function hebrewRules(): string {
  return `You are a native Israeli Hebrew speaker and a patient teacher.
Write short, common, SPOKEN Israeli Hebrew — the way people talk today, not a textbook calque and not the Bible.
- Modern everyday register. No Biblical or liturgical Hebrew (no ויהי, הנה as "behold", אשר where ש/ש- fits, no elevated narrative).
- No word-for-word English. "I have a black dog" is "יש לי כלב שחור", never "אני יש כלב שחור" and never "כלב שחור יש לי".
- Adjectives come AFTER the noun and agree in gender and number: כלב שחור (a black dog), not שחור כלב. ילדה טובה, not טוב ילדה.
- Correct word order, prepositions, and agreement. Nikud-less standard spelling.
CANONICAL EXAMPLE for כלב (kelev, dog): "${KELEV_SENTENCE.sentence}" (${KELEV_SENTENCE.transliteration}) = "${KELEV_SENTENCE.english}".`;
}

function otherLanguageRules(label: string): string {
  return `You are a native ${label} speaker and a patient teacher.
Write a short, common, everyday SPOKEN sentence — the way people talk today.
Correct agreement, natural word order, and ordinary vocabulary. No archaic, biblical, or word-for-word English.`;
}

export function exampleSentencePrompt(input: SentenceInput): string {
  const t = targetOf(input);
  const frame = t.hebrew ? hebrewRules() : otherLanguageRules(t.label);
  const base = t.word
    ? `Use the dictionary base "${t.word}" (${t.phonetic}, "${t.meaning}"), or a normal inflected form of THAT base. Do not invent a mnemonic from a prefixed spelling (בבית → talk about בית; del perro → perro; the house → Haus).`
    : "";
  return `${frame}

TARGET: ${t.label} "${t.word}" (${t.phonetic}) = "${t.meaning}".
${base}

Write ${t.count} DIFFERENT sentence${t.count > 1 ? "s" : ""}, each 3–7 words, that a learner would actually hear.
Each sentence must contain the target (or a correct inflected form of it).
The Latin transliteration is how the sentence is said. The English says exactly the same thing as the ${t.label} — not a looser paraphrase.

Return JSON: { "examples": [ { "hebrew_sentence": the sentence in ${t.label} script, "transliteration": the whole sentence in Latin letters, "english": its English, "words": [ { "hebrew": one ${t.label} word, "word": its transliteration, "meaning": its English } ] } ] }
"words" is in order and joins back into hebrew_sentence.`;
}

export function sentenceReviewPrompt(input: SentenceInput, drafts: SentenceDraft[]): string {
  const t = targetOf(input);
  const frame = t.hebrew
    ? `You are a native Israeli Hebrew speaker reviewing learner sentences. Accept only natural, modern, spoken Hebrew: adjective after the noun, correct agreement, no Biblical phrasing, no literal translation. "${KELEV_SENTENCE.sentence}" is acceptable for כלב; "כלב שחור יש לי" is not.`
    : `You are a native ${t.label} speaker reviewing learner sentences. Accept only natural, modern, spoken ${t.label}.`;
  const listed = drafts.map((d, i) => `${i + 1}. ${clip(d.hebrew_sentence || d.sentence, 300)} || ${clip(d.transliteration, 300)} || ${clip(d.english, 300)}`).join("\n");
  return `${frame}

The sentence is about "${t.word}" (${t.phonetic}, "${t.meaning}").
For each draft, set ok true only if the ${t.label} is something you would say. If it is wrong or unnatural, set ok false and replace it.
When you replace a sentence, the transliteration and the English MUST describe the corrected sentence, not the draft.
When ok is true, repeat the same sentence and the transliteration and English that match it.

Drafts:
${listed}

Return JSON: { "examples": [ { "ok": boolean, "hebrew_sentence": the sentence you accept, "transliteration": how THAT sentence is said, "english": what THAT sentence means, "words": [ { "hebrew", "word", "meaning" } ] } ] }`;
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    examples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hebrew_sentence: { type: "string" },
          transliteration: { type: "string" },
          english: { type: "string" },
          words: {
            type: "array",
            items: {
              type: "object",
              properties: { hebrew: { type: "string" }, word: { type: "string" }, meaning: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    examples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          hebrew_sentence: { type: "string" },
          transliteration: { type: "string" },
          english: { type: "string" },
          words: {
            type: "array",
            items: {
              type: "object",
              properties: { hebrew: { type: "string" }, word: { type: "string" }, meaning: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

function glosses(words: SentenceDraft["words"], sentence: string): CardExample["words"] | undefined {
  if (!Array.isArray(words) || words.length === 0) return undefined;
  const mapped = words
    .map((w) => ({
      hebrew: clip(w?.hebrew, 40),
      word: clip(w?.word, 40),
      meaning: clip(w?.meaning, 80),
    }))
    .filter((w) => w.hebrew);
  if (!mapped.length) return undefined;
  if (compact(mapped.map((w) => w.hebrew).join(" ")) !== compact(sentence)) return undefined;
  return mapped;
}

/**
 * The sentence that may be shown. A rejection without a full replacement
 * (sentence + matching transliteration + matching English) yields null —
 * the unchecked draft is not shown.
 */
export function applySentenceReview(draft: SentenceDraft, review: SentenceReview | null | undefined): CardExample | null {
  const draftSentence = clip(draft?.hebrew_sentence || draft?.sentence, 300);
  const draftTrans = clip(draft?.transliteration, 300);
  const draftEnglish = clip(draft?.english, 300);
  if (!review || typeof review !== "object") return null;

  const reviewSentence = clip(review.hebrew_sentence || review.sentence, 300);
  const reviewTrans = clip(review.transliteration, 300);
  const reviewEnglish = clip(review.english, 300);
  const replaced = review.ok === false || (!!reviewSentence && compact(reviewSentence) !== compact(draftSentence));

  if (replaced) {
    if (!reviewSentence || !reviewTrans || !reviewEnglish) return null;
    return {
      hebrew_sentence: reviewSentence,
      transliteration: reviewTrans,
      english: reviewEnglish,
      words: glosses(review.words, reviewSentence),
    };
  }

  const sentence = draftSentence || reviewSentence;
  const transliteration = reviewTrans || draftTrans;
  const english = reviewEnglish || draftEnglish;
  if (!sentence || !transliteration || !english) return null;
  return {
    hebrew_sentence: sentence,
    transliteration,
    english,
    words: glosses(review.words?.length ? review.words : draft.words, sentence),
  };
}

export function sentenceCacheKey(input: SentenceInput): string {
  const t = targetOf(input);
  return [SENTENCE_CACHE_VERSION, t.language, plainSpelling(t.word), plainSpelling(t.phonetic), t.meaning.toLowerCase(), String(t.count)].join("|");
}

const memoryCache = new Map<string, CardExample[]>();
const memoryInflight = new Map<string, Promise<CardExample[]>>();

export function clearSentenceCache() {
  memoryCache.clear();
  memoryInflight.clear();
}

async function draftAndReview(input: SentenceInput, invoke: LlmInvoke): Promise<CardExample[]> {
  const drafted = await invoke({
    prompt: exampleSentencePrompt(input),
    response_json_schema: DRAFT_SCHEMA,
    model: FAST_SENTENCE_MODEL,
    max_tokens: 900,
  });
  const drafts: SentenceDraft[] = Array.isArray(drafted?.examples) ? drafted.examples : [];
  if (!drafts.length) return [];
  const reviewed = await invoke({
    prompt: sentenceReviewPrompt(input, drafts),
    response_json_schema: REVIEW_SCHEMA,
    model: FAST_SENTENCE_MODEL,
    max_tokens: 900,
  });
  const reviews: SentenceReview[] = Array.isArray(reviewed?.examples) ? reviewed.examples : [];
  const count = input.count === 1 ? 1 : 3;
  const out: CardExample[] = [];
  for (let i = 0; i < drafts.length && out.length < count; i++) {
    const verified = applySentenceReview(drafts[i], reviews[i]);
    if (verified) out.push(verified);
  }
  return out;
}

/**
 * Verified sentences for this word. Repeated views reuse the cache.
 * Pass `cache: false` to write a fresh one (the regenerate button).
 */
export function warmVerifiedExamples(
  input: SentenceInput,
  invoke: LlmInvoke,
  opts: { cache?: boolean } = {},
): Promise<CardExample[]> {
  const key = sentenceCacheKey(input);
  if (opts.cache !== false) {
    const hit = memoryCache.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = memoryInflight.get(key);
    if (pending) return pending;
  }
  const run = draftAndReview(input, invoke)
    .then((rows) => {
      if (rows.length && opts.cache !== false) memoryCache.set(key, rows);
      return rows;
    })
    .finally(() => {
      if (memoryInflight.get(key) === run) memoryInflight.delete(key);
    });
  if (opts.cache !== false) memoryInflight.set(key, run);
  return run;
}

export function sentenceInputFromWord(word: any, language?: string | null, count = 3): SentenceInput {
  return {
    language: word?.language || language || "hebrew",
    word: word?.word || "",
    phonetic: word?.phonetic || "",
    meaning: word?.translation || word?.meaning || "",
    lemma: word?.mnemonic_lemma || (word?.is_verb ? word?.word : "") || "",
    lemmaPhonetic: word?.mnemonic_lemma_phonetic || (word?.is_verb ? word?.phonetic : "") || "",
    count,
  };
}
