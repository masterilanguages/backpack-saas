// The base form a mnemonic is built from. The card keeps the word the student
// saved (בבית / babait); the sound match and the picture use the dictionary
// form (בית / bayit).
//
// The model decides the lemma from the sentence and the meaning. This module
// only accepts that decision when it is structurally a real base form: a
// Hebrew/Arabic clitic prefix, a Romance article or contraction, or an
// inflection that is not "delete the first letter". Root letters are never
// stripped here — לחם (bread) and ללכת (to go) stay whole.

import { plainSpelling, stripNikud } from "./verbs";

export type LemmaRelation = "same" | "clitic" | "inflection" | "stored";

// Shared with masterilanguages_v1. The verb infinitive lives in lemma_key;
// this marker is the mnemonic base and survives even if the new columns
// are not migrated yet.
const LEMMA_MARK = /\[\[lemma:([^|\]]*)\|([^|\]]*)\|([^\]]*)\]\]\s*/;

const markerToken = (value: unknown) => clip(value, 80).replace(/[\[\]|]/g, "");

export function stripLemmaMarker(text: unknown): string {
  return clip(text, 2000).replace(LEMMA_MARK, "").trim();
}

export function embedLemma(
  explanation: string,
  lemma: { lemma: string; lemmaPhonetic: string; lemmaMeaning?: string },
): string {
  const body = stripLemmaMarker(explanation);
  return `[[lemma:${markerToken(lemma.lemma)}|${markerToken(lemma.lemmaPhonetic)}|${markerToken(lemma.lemmaMeaning)}]] ${body}`.trim();
}

export function readEmbeddedLemma(text: unknown): { lemma: string; lemmaPhonetic: string; lemmaMeaning: string } | null {
  const match = LEMMA_MARK.exec(clip(text, 2000));
  if (!match) return null;
  const lemma = match[1].trim();
  const lemmaPhonetic = match[2].trim();
  const lemmaMeaning = match[3].trim();
  if (!lemma && !lemmaPhonetic) return null;
  return { lemma: lemma || lemmaPhonetic, lemmaPhonetic: lemmaPhonetic || lemma, lemmaMeaning };
}

/**
 * Fields written onto a word. Never includes lemma_key (that is the verb
 * infinitive). Columns are optional; the marker inside mnemonic_explanation
 * is the copy v1 reads when the columns are absent.
 */
export function mnemonicSaveFields(
  basis: { lemma: string; lemmaPhonetic: string; lemmaMeaning?: string },
  explanation: string,
  imageUrl?: string,
): Record<string, string> {
  const data: Record<string, string> = {
    mnemonic_explanation: embedLemma(explanation, basis),
    mnemonic_lemma: basis.lemma,
    mnemonic_lemma_phonetic: basis.lemmaPhonetic,
    mnemonic_lemma_meaning: basis.lemmaMeaning || "",
  };
  if (imageUrl) data.image_url = imageUrl;
  return data;
}

export type LemmaInput = {
  language?: string | null;
  word?: string | null;
  phonetic?: string | null;
  meaning?: string | null;
};

export type LemmaProposal = {
  lemma?: unknown;
  lemma_phonetic?: unknown;
  lemma_meaning?: unknown;
  relation?: unknown;
};

export type AcceptedLemma = {
  lemma: string;
  lemmaPhonetic: string;
  lemmaMeaning: string;
  relation: LemmaRelation;
  /** The base differs from the word printed on the card. */
  changed: boolean;
};

// ו/ש then one of בכלמ then ה. והבית, שבבית, בבית, הבית — not שהב (wrong order).
const HEBREW_CLITIC = /^(?:ו)?(?:ש)?(?:[בכלמ])?(?:ה)?$/;
const ARABIC_CLITIC = /^(?:[وف])?(?:[بلك])?(?:ال)?$/;
const FUNCTION_WORD = /\b(in|at|on|to|for|from|of|as|and|the|that|a|an)\b/i;
const ROMANCE_CLITIC =
  /^(?:del|al|della|dello|delle|dei|degli|alla|allo|alle|agli|ai|des|du|au|aux|l'|d'|j'|un|una|unos|unas|el|la|los|las|les|le|il|lo|gli|der|die|das|dem|den|ein|eine|eines|einer|einem|einen|the|a|an)\s+/i;

const clip = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const same = (a: string, b: string) => !!plainSpelling(a) && plainSpelling(a) === plainSpelling(b);

export function hebrewCliticPrefix(prefix: string): boolean {
  const p = stripNikud(prefix);
  if (!p || p.length > 4) return false;
  return HEBREW_CLITIC.test(p);
}

function meaningHasFunction(meaning: string): boolean {
  return FUNCTION_WORD.test(meaning);
}

/** ללכת → לכת drops the infinitive marker, which is part of the base form. */
function dropsHebrewInfinitive(surface: string, lemma: string, meaning: string): boolean {
  if (!/^to\b/i.test(meaning.trim())) return false;
  const s = stripNikud(surface);
  const l = stripNikud(lemma);
  return s.startsWith("ל") && s.slice(1) === l;
}

function acceptHebrew(surface: string, lemma: string, meaning: string): boolean {
  const s = stripNikud(surface);
  const l = stripNikud(lemma);
  if (!s || !l || l.length < 2) return false;
  if (s === l) return true;
  if (!s.endsWith(l)) return false;
  const prefix = s.slice(0, s.length - l.length);
  if (!hebrewCliticPrefix(prefix)) return false;
  if (dropsHebrewInfinitive(surface, lemma, meaning)) return false;
  // A single ב/ל/כ/מ/ו/ש is a prefix only when the meaning shows it
  // ("in the house"). ה (the) is the definite article. לחם "bread" is not "to ham".
  if (prefix.length === 1 && prefix !== "ה" && !meaningHasFunction(meaning)) return false;
  return true;
}

function acceptArabic(surface: string, lemma: string): boolean {
  const s = surface.replace(/[\u064B-\u065F]/g, "");
  const l = lemma.replace(/[\u064B-\u065F]/g, "");
  if (!l || l.length < 2) return false;
  if (s === l) return true;
  if (!s.endsWith(l)) return false;
  return ARABIC_CLITIC.test(s.slice(0, s.length - l.length));
}

function withoutRomanceClitics(surface: string): string {
  let s = surface.trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(ROMANCE_CLITIC, "").trim();
    if (next === s) break;
    s = next;
  }
  const glued = s.match(/^[ldj]'(.+)$/i);
  return glued ? glued[1] : s;
}

function acceptRomanceClitic(surface: string, lemma: string): boolean {
  const rest = withoutRomanceClitics(surface);
  if (!rest || same(rest, surface)) return false;
  return same(rest, lemma);
}

function isFrontChop(surface: string, lemma: string): boolean {
  const s = plainSpelling(surface);
  const l = plainSpelling(lemma);
  return s.length > 2 && s.slice(1) === l;
}

/**
 * Shown under the word when the mnemonic used a different base form.
 * "בית · bayit". Hidden when the card is already that form.
 */
export function mnemonicBaseLabel(word: {
  word?: string | null;
  phonetic?: string | null;
  mnemonic_lemma?: string | null;
  mnemonic_lemma_phonetic?: string | null;
  mnemonic_explanation?: string | null;
} | null | undefined): string | null {
  const embedded = readEmbeddedLemma(word?.mnemonic_explanation);
  const lemma = clip(word?.mnemonic_lemma, 60) || embedded?.lemma || "";
  const phonetic = clip(word?.mnemonic_lemma_phonetic, 60) || embedded?.lemmaPhonetic || "";
  if (!lemma && !phonetic) return null;
  const sameScript = !lemma || same(lemma, clip(word?.word, 60));
  const sameSound = !phonetic || same(phonetic, clip(word?.phonetic, 60));
  if (sameScript && sameSound) return null;
  return [lemma, phonetic].filter(Boolean).join(" · ");
}

/**
 * A base already decided earlier: a stored mnemonic lemma, or a verb card
 * whose word/phonetic are the infinitive. The model must not chop it.
 */
export function storedMnemonicBase(word: {
  word?: string | null;
  phonetic?: string | null;
  translation?: string | null;
  is_verb?: boolean | null;
  mnemonic_lemma?: string | null;
  mnemonic_lemma_phonetic?: string | null;
  mnemonic_lemma_meaning?: string | null;
  mnemonic_explanation?: string | null;
} | null | undefined): AcceptedLemma | null {
  const embedded = readEmbeddedLemma(word?.mnemonic_explanation);
  const storedLemma = clip(word?.mnemonic_lemma, 60) || embedded?.lemma || "";
  const storedPhonetic = clip(word?.mnemonic_lemma_phonetic, 60) || embedded?.lemmaPhonetic || "";
  if (storedLemma && storedPhonetic) {
    return {
      lemma: storedLemma,
      lemmaPhonetic: storedPhonetic,
      lemmaMeaning: clip(word?.mnemonic_lemma_meaning, 120) || embedded?.lemmaMeaning || clip(word?.translation, 120),
      relation: "stored",
      changed: mnemonicBaseLabel(word) != null,
    };
  }
  if (word?.is_verb && clip(word.word, 60) && clip(word.phonetic, 60)) {
    return {
      lemma: clip(word.word, 60),
      lemmaPhonetic: clip(word.phonetic, 60),
      lemmaMeaning: clip(word?.translation, 120),
      relation: "stored",
      changed: false,
    };
  }
  return null;
}

/**
 * Accept the model's lemma, or keep the surface word when the proposal would
 * drop a root letter or is not a prefix/inflection of this word.
 */
export function acceptMnemonicLemma(input: LemmaInput, proposal: LemmaProposal | null | undefined): AcceptedLemma {
  const script = clip(input.word, 60);
  const phonetic = clip(input.phonetic, 60) || script;
  const meaning = clip(input.meaning, 120);
  const language = String(input.language || "hebrew").toLowerCase();
  const surface = script || phonetic;

  const fallback = (): AcceptedLemma => ({
    lemma: script || surface,
    lemmaPhonetic: phonetic,
    lemmaMeaning: meaning,
    relation: "same",
    changed: false,
  });

  const lemma = clip(proposal?.lemma, 60);
  const lemmaPhonetic = clip(proposal?.lemma_phonetic, 60);
  const lemmaMeaning = clip(proposal?.lemma_meaning, 120) || meaning;
  if (!lemma || !lemmaPhonetic) return fallback();

  let relation = String(proposal?.relation || "").toLowerCase();
  if (relation !== "same" && relation !== "clitic" && relation !== "inflection") {
    if (same(script || surface, lemma) && same(phonetic, lemmaPhonetic)) relation = "same";
    else if ((language === "hebrew" || /[א-ת]/.test(script)) && acceptHebrew(script || surface, lemma, meaning)) relation = "clitic";
    else if ((language === "arabic" || /[\u0600-\u06FF]/.test(script)) && acceptArabic(script, lemma)) relation = "clitic";
    else if (acceptRomanceClitic(script || phonetic, lemma) || acceptRomanceClitic(phonetic, lemmaPhonetic)) relation = "clitic";
    else relation = "inflection";
  }

  if (relation === "same") {
    if (!same(script || surface, lemma) && !same(phonetic, lemma)) return fallback();
    return { lemma, lemmaPhonetic, lemmaMeaning, relation: "same", changed: false };
  }

  if (relation === "clitic") {
    const hebrewOk = (language === "hebrew" || /[א-ת]/.test(script)) && acceptHebrew(script || surface, lemma, meaning);
    const arabicOk = (language === "arabic" || /[\u0600-\u06FF]/.test(script)) && acceptArabic(script, lemma);
    const phraseOk = acceptRomanceClitic(script || phonetic, lemma) || acceptRomanceClitic(phonetic, lemmaPhonetic);
    if (!hebrewOk && !arabicOk && !phraseOk) return fallback();
  } else {
    if (lemma.length < 2 || lemmaPhonetic.length < 2) return fallback();
    if (isFrontChop(script || surface, lemma) || isFrontChop(phonetic, lemmaPhonetic)) return fallback();
    if (dropsHebrewInfinitive(script || surface, lemma, meaning)) return fallback();
  }

  const changed = !same(script || surface, lemma) || !same(phonetic, lemmaPhonetic);
  return { lemma, lemmaPhonetic, lemmaMeaning, relation: relation as LemmaRelation, changed };
}
