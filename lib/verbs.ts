// Verbs in the Backpack ("Verbos en Flashcards"): a conjugated verb saved from
// a video becomes one card per infinitive, keeping every form the student met
// (verb_forms, migration 2200), its grammar, and a shared conjugation table
// (verb_lexicon, made once per verb by the verbConjugations edge function).
//
// Pure and import-free: used by the app (lib/saveWord) and by the edge
// function, and tested with `deno test lib/verbs.test.ts`.

export const VERB_PROMPT_VERSION = "verbs-v1";

/** Hebrew points and cantillation (nikud), stripped for comparisons. */
const POINTS = /[֑-ׇ]/g;
const HEBREW_LETTER = /[א-ת]/;
const PUNCT = /[\s.,!?;:"'״׳()[\]{}\-–—…]/g;

export const stripNikud = (s: string) => String(s || "").replace(POINTS, "");

/** Spelling used to compare words: no nikud, no punctuation or spaces, lower case. */
export const plainSpelling = (s: string) => stripNikud(s).replace(PUNCT, "").toLowerCase();

const BINYANIM: Record<string, string> = {
  paal: "paal", qal: "paal", kal: "paal",
  nifal: "nifal", niphal: "nifal",
  piel: "piel",
  pual: "pual",
  hifil: "hifil", hiphil: "hifil",
  hufal: "hufal", hofal: "hufal", huphal: "hufal", hophal: "hufal",
  hitpael: "hitpael", hitpaal: "hitpael",
};

/** "Hif'il", "HIPHIL", "hifil" → "hifil". Unknown names → "". */
export function normalizeBinyan(b: unknown): string {
  const k = String(b || "").toLowerCase().replace(/[^a-z]/g, "");
  return BINYANIM[k] || "";
}

/**
 * The key of one verb: its infinitive without nikud, plus the binyan, so two
 * verbs spelled alike without nikud stay apart. The vowel letters ו and י
 * after the first letter don't count, so the full and the defective spelling
 * (לאהוב / לֶאֱהֹב → לאהב) are the same verb; the binyan still tells ללמוד
 * (paal) from ללמד (piel). "" when there is no lemma.
 */
export function lemmaKey(lemma: string, binyan?: unknown): string {
  const plain = plainSpelling(lemma);
  if (!plain) return "";
  const base = plain.charAt(0) + plain.slice(1).replace(/[וי]/g, "");
  const b = normalizeBinyan(binyan);
  return b ? `${base}|${b}` : base;
}

export type Tense = "past" | "present" | "future" | "imperative" | "infinitive";
export type Gender = "m" | "f";
export type GrammarNumber = "sg" | "pl";

/** What the model says about one word in its sentence, validated. */
export type VerbAnalysis = {
  lemma: string;            // infinitive in native script (with nikud for Hebrew)
  lemma_phonetic: string;
  lemma_meaning: string;    // "to put"
  binyan: string;           // normalized ("hifil") or ""
  root: string;
  tense: Tense | null;
  person: 1 | 2 | 3 | null;
  gender: Gender | null;
  number: GrammarNumber | null;
  prefix: string;           // attached particles (ש, ו, ה…) not part of the verb
  form: string;             // the verb form without those particles
  phonetic: string;         // transliteration of the word as said in the video
  translation: string;      // meaning of the conjugated form in this sentence
};

const TENSES: Tense[] = ["past", "present", "future", "imperative", "infinitive"];
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Validates the model's answer about one word. null = not a verb (or an
 * answer we can't trust), so the word is saved exactly as today.
 */
export function parseVerbAnalysis(raw: any, language: string, surface: string): VerbAnalysis | null {
  if (!raw || typeof raw !== "object" || raw.is_verb !== true) return null;
  const lemma = str(raw.lemma, 60);
  if (!lemma || !lemmaKey(lemma)) return null;
  if (/hebrew/i.test(language) && !HEBREW_LETTER.test(lemma)) return null;
  const tense = TENSES.includes(raw.tense) ? (raw.tense as Tense) : null;
  const person = [1, 2, 3].includes(Number(raw.person)) ? (Number(raw.person) as 1 | 2 | 3) : null;
  const gender = raw.gender === "m" || raw.gender === "f" ? (raw.gender as Gender) : null;
  const number = raw.number === "sg" || raw.number === "pl" ? (raw.number as GrammarNumber) : null;
  const prefix = str(raw.prefix, 6);
  let form = str(raw.form, 60);
  // The form must be part of the word as written; otherwise fall back to the
  // word minus its prefix (or the whole word).
  const plainSurface = plainSpelling(surface);
  if (!form || !plainSurface.includes(plainSpelling(form))) {
    form = prefix && plainSurface.startsWith(plainSpelling(prefix)) ? stripNikud(surface).slice(stripNikud(prefix).length) : surface;
  }
  return {
    lemma,
    lemma_phonetic: str(raw.lemma_phonetic, 60),
    lemma_meaning: str(raw.lemma_meaning, 80),
    binyan: normalizeBinyan(raw.binyan),
    root: str(raw.root, 20),
    tense, person, gender, number,
    prefix, form,
    phonetic: str(raw.phonetic, 60),
    translation: str(raw.translation, 120),
  };
}

/** One time the student met the verb: the exact word, its grammar and where. */
export type VerbOccurrence = {
  surface: string;
  prefix?: string;
  form?: string;
  phonetic?: string;
  translation?: string;
  tense?: Tense | null;
  person?: 1 | 2 | 3 | null;
  gender?: Gender | null;
  number?: GrammarNumber | null;
  sentence?: string | null;
  video_id?: string | null;
  video_title?: string | null;
  added_at?: string;
};

export function occurrenceFrom(
  surface: string,
  a: VerbAnalysis,
  ctx: { sentence?: string | null; video_id?: string | null; video_title?: string | null } = {},
): VerbOccurrence {
  return {
    surface: String(surface || "").trim(),
    prefix: a.prefix || undefined,
    form: a.form || undefined,
    phonetic: a.phonetic || undefined,
    translation: a.translation || undefined,
    tense: a.tense, person: a.person, gender: a.gender, number: a.number,
    sentence: ctx.sentence || null,
    video_id: ctx.video_id || null,
    video_title: ctx.video_title || null,
  };
}

/** Same word in the same video = same occurrence (also the SQL rule in 2200). */
export const occurrenceKey = (o: Pick<VerbOccurrence, "surface" | "video_id">) =>
  `${plainSpelling(o.surface)}|${o.video_id || ""}`;

export const MAX_OCCURRENCES = 50;

/** Adds an occurrence unless the card already has it. Never mutates `forms`. */
export function mergeOccurrence(forms: VerbOccurrence[] | null | undefined, occ: VerbOccurrence): VerbOccurrence[] {
  const list = Array.isArray(forms) ? forms : [];
  const key = occurrenceKey(occ);
  if (list.some((o) => occurrenceKey(o) === key) || list.length >= MAX_OCCURRENCES) return list;
  return [...list, occ];
}

// --------------------------------------------------------------- conjugations

/**
 * Cells of a Hebrew conjugation table. Present tense goes by gender and
 * number; modern future/imperative plurals are common gender.
 */
export const CONJUGATION_SLOTS: Record<Exclude<Tense, "infinitive">, string[]> = {
  past: ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2mp", "2fp", "3p"],
  present: ["ms", "fs", "mp", "fp"],
  future: ["1s", "2ms", "2fs", "3ms", "3fs", "1p", "2p", "3p"],
  imperative: ["ms", "fs", "p"],
};

export type ConjugationCell = { he: string; phonetic: string };
export type ConjugationTable = Partial<Record<keyof typeof CONJUGATION_SLOTS, Record<string, ConjugationCell>>>;

/**
 * The cell of the table a form belongs to, from its grammar (never by
 * comparing spellings, which prefixes like ש or ו would break).
 */
export function slotFor(g: { tense?: Tense | null; person?: number | null; gender?: Gender | null; number?: GrammarNumber | null }):
  { tense: keyof typeof CONJUGATION_SLOTS; slot: string } | null {
  const { tense, person, gender, number } = g;
  if (!tense || tense === "infinitive" || !number) return null;
  let slot = "";
  if (tense === "present") {
    if (!gender) return null;
    slot = `${gender}${number === "sg" ? "s" : "p"}`;
  } else if (tense === "imperative") {
    slot = number === "pl" ? "p" : gender ? `${gender}s` : "";
  } else {
    if (!person) return null;
    if (number === "sg") slot = person === 1 ? "1s" : gender ? `${person}${gender}s` : "";
    else if (person === 1) slot = "1p";
    else if (tense === "past" && person === 2) slot = gender ? `2${gender}p` : "";
    else slot = `${person}p`;
  }
  return slot && CONJUGATION_SLOTS[tense].includes(slot) ? { tense, slot } : null;
}

/** True only for a table with at least one filled cell ('{}', the column default, is not one). */
export function hasConjugations(c: unknown): boolean {
  if (!c || typeof c !== "object") return false;
  return Object.values(c as Record<string, any>).some(
    (t) => t && typeof t === "object" && Object.values(t).some((cell: any) =>
      typeof cell === "string" ? !!cell.trim() : !!(cell && typeof cell.he === "string" && cell.he.trim())),
  );
}

/**
 * Validates a generated table: only known cells, each with native spelling.
 * null when too little came back to be worth caching for everyone.
 */
export function parseConjugations(raw: any): ConjugationTable | null {
  const src = raw?.conjugations ?? raw;
  if (!src || typeof src !== "object") return null;
  const out: ConjugationTable = {};
  let filled = 0, total = 0;
  for (const [tense, slots] of Object.entries(CONJUGATION_SLOTS) as [keyof typeof CONJUGATION_SLOTS, string[]][]) {
    total += slots.length;
    const t = src[tense];
    if (!t || typeof t !== "object") continue;
    const cells: Record<string, ConjugationCell> = {};
    for (const s of slots) {
      const c = t[s];
      const he = str(typeof c === "string" ? c : c?.he, 40);
      if (!he) continue;
      cells[s] = { he, phonetic: str(typeof c === "object" ? c?.phonetic : "", 40) };
      filled++;
    }
    if (Object.keys(cells).length) out[tense] = cells;
  }
  return filled >= Math.ceil(total * 0.75) ? out : null;
}

// -------------------------------------------------------------------- prompts

export const VERB_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    is_verb: { type: "boolean" },
    lemma: { type: "string" },
    lemma_phonetic: { type: "string" },
    lemma_meaning: { type: "string" },
    binyan: { type: "string" },
    root: { type: "string" },
    tense: { type: "string", enum: TENSES },
    person: { type: "integer" },
    gender: { type: "string", enum: ["m", "f"] },
    number: { type: "string", enum: ["sg", "pl"] },
    prefix: { type: "string" },
    form: { type: "string" },
    phonetic: { type: "string" },
    translation: { type: "string" },
  },
  required: ["is_verb"],
};

/**
 * One question about one word in its sentence. `translitRules` is passed in
 * (lib/chapterPrompts translitRules) so this file stays import-free.
 */
const analysisRules = (label: string, the: string) =>
  `- A present-tense participle used as a noun or adjective (e.g. מורה "teacher"), nouns, adjectives, adverbs and particles are NOT verbs: give { "is_verb": false } and nothing else.
- If it is a verb (any tense, the imperative, or an infinitive), give:
  is_verb: true; lemma: its infinitive in ${label} script${/hebrew/i.test(label) ? " with full nikud (e.g. לְהַנִּיחַ)" : ""}; lemma_phonetic; lemma_meaning: the English infinitive ("to put");${/hebrew/i.test(label) ? " binyan (paal, nifal, piel, pual, hifil, hufal, hitpael); root (e.g. נ-ו-ח);" : ""}
  tense (past, present, future, imperative, infinitive); person (1, 2, 3; omit for present and infinitive); gender (m or f; omit when the form doesn't show it); number (sg or pl);
  prefix: particles attached in front that are not part of the verb (e.g. ש, ו, כש) or ""; form: the verb without them;
  phonetic: transliteration of ${the} as said there; translation: English meaning of ${the} in its sentence ("that you put").`;

export const verbAnalysisPrompt = (label: string, word: string, sentence: string, translitRules = "") =>
  `In this ${label} sentence: "${sentence}"
look at the word "${word}". Is it a verb form?
${analysisRules(label, `"${word}"`)}${translitRules}`;

export const VERB_BATCH_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, ...VERB_ANALYSIS_SCHEMA.properties },
        required: ["i", "is_verb"],
      },
    },
  },
  required: ["items"],
};

/** Several words at once (a lesson's recommended words): one call instead of one per word. */
export const verbBatchPrompt = (label: string, items: { word: string; sentence: string }[], translitRules = "") =>
  `For each numbered ${label} word below, look at it in its sentence and say whether it is a verb form.
${analysisRules(label, "the word")}
Return { "items": [ { "i": the word's number, ...the fields above } ] }, one item per word.

${items.map((x, i) => `${i}. "${x.word}" in: "${x.sentence}"`).join("\n")}${translitRules}`;

export const CONJUGATION_SCHEMA = {
  type: "object",
  properties: {
    conjugations: {
      type: "object",
      properties: Object.fromEntries(Object.entries(CONJUGATION_SLOTS).map(([t, slots]) => [t, {
        type: "object",
        properties: Object.fromEntries(slots.map((s) => [s, {
          type: "object",
          properties: { he: { type: "string" }, phonetic: { type: "string" } },
        }])),
      }])),
    },
  },
  required: ["conjugations"],
};

export const conjugationPrompt = (label: string, lemma: string, meaning: string, binyan: string, translitRules = "") =>
  `Conjugate the ${label} verb ${lemma}${meaning ? ` ("${meaning}")` : ""}${binyan ? `, binyan ${binyan}` : ""}, in modern standard ${label}.
Return { "conjugations": { tense: { cell: { "he": the form in ${label} script${/hebrew/i.test(label) ? " with full nikud" : ""}, "phonetic": its transliteration } } } } with exactly these cells:
- past: 1s, 2ms, 2fs, 3ms, 3fs, 1p, 2mp, 2fp, 3p
- present: ms, fs, mp, fp (masculine/feminine singular/plural)
- future: 1s, 2ms, 2fs, 3ms, 3fs, 1p, 2p, 3p (modern common-gender plurals)
- imperative: ms, fs, p
(1/2/3 = person, m/f = gender, s/p = singular/plural.)${translitRules}`;
