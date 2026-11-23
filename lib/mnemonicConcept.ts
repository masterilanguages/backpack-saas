// One call that picks the dictionary base and the sound-picture for it.
// The sound anchor is the base (bayit), never the prefixed surface (babait).

import { mnemonicImagePrompt } from "./imageStyle";
import { languageLabel } from "./language";
import {
  acceptMnemonicLemma,
  storedMnemonicBase,
  type AcceptedLemma,
  type LemmaInput,
} from "./mnemonicLemma";
import type { LlmInvoke } from "./mnemonicSentence";

export type MnemonicConcept = {
  lemma: string;
  lemmaPhonetic: string;
  lemmaMeaning: string;
  changed: boolean;
  soundAnchor: string;
  explanation: string;
  scene: string;
  fullImagePrompt: string;
};

const clip = (v: unknown, max = 800) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export const MNEMONIC_CONCEPT_SCHEMA = {
  type: "object",
  properties: {
    relation: { type: "string" },
    lemma: { type: "string" },
    lemma_phonetic: { type: "string" },
    lemma_meaning: { type: "string" },
    sound_anchor: { type: "string" },
    explanation: { type: "string" },
    image_prompt: { type: "string" },
  },
};

export function mnemonicConceptPrompt(word: any, language: string, fixed: AcceptedLemma | null): string {
  const label = languageLabel(language || word?.language);
  const script = String(word?.word || "").trim();
  const phonetic = String(word?.phonetic || "").trim();
  const meaning = String(word?.translation || "").trim();
  const sentence = String(word?.example_sentence || "").trim();
  const baseLine = fixed
    ? `The base form is ALREADY decided: "${fixed.lemma}" (${fixed.lemmaPhonetic}), meaning "${fixed.lemmaMeaning || meaning}". Use it. Do not drop a letter from it.`
    : `STEP 0 — BASE FORM. Decide the dictionary form from the meaning and the sentence. Do NOT chop the first letter yourself.
Hebrew clitics that are real prefixes: ב/בּ (be/ba), ל (le/la), כ (ke/ka), מ (mi/me), ה (ha, "the"), ו (ve, "and"), ש (she, "that"), including stacks like וה, שב, שב.
בבית (babait, "in the house") → בית (bayit). הבית → בית. NOT לחם (lechem, "bread") → חם: that ל is the root. NOT מים (mayim, water), NOT שמש (shemesh, sun). NOT ללכת (lalechet, "to go") → לכת: the infinitive ל stays.
Spanish/French/Italian: drop articles and contractions (del, al, l', d', un, una) but not part of the noun. Arabic: ال / و / ب / ل / ف when they are clitics. German: der/die/das/ein. Verbs: the infinitive (fui → ir, הלכתי → ללכת). Plurals: the singular (casas → casa).
relation is "same" (already the base), "clitic" (only a prefix/article came off), or "inflection" (plural or conjugation). lemma is native script. lemma_phonetic is the Latin of the BASE, not of the prefixed word.`;

  return `You create sound-based visual mnemonics for language learning.

Surface word on the card (keep this; do not replace it): ${label} "${script}" / ${phonetic} = "${meaning}".
${sentence && !/^Session \d+$/i.test(sentence) ? `Context sentence: "${sentence}"` : ""}
${baseLine}

STEP 1 — SOUND MATCH the BEGINNING of the BASE form's pronunciation (lemma_phonetic), the first 1–2 syllables. A real common English noun, a physical object or creature, never a color. Hebrew ח/כ is a breathy H ("chatunah" → "hat"), never "chair" and never "k".
STEP 2 — SCENE: that object is a small prop inside a funny modern scene whose BIG focus is the meaning of the BASE ("${fixed?.lemmaMeaning || meaning}"). No medieval, military, or violent setting. Describe only what happens.
STEP 3 — No speech, no text, no labels, no names.

explanation: ONE complete short sentence of at most 9 words and 42 characters, like "An ESKIMO (askeem) shaking hands to agree"

Return JSON: relation, lemma, lemma_phonetic, lemma_meaning, sound_anchor, explanation, image_prompt (the scene only, no art-style words).`;
}

export function parseMnemonicConcept(raw: any, input: LemmaInput, fixed: AcceptedLemma | null): MnemonicConcept {
  const accepted = fixed ?? acceptMnemonicLemma(input, raw || {});
  const sound = clip(raw?.sound_anchor, 40) || accepted.lemmaPhonetic;
  const explanation = clip(raw?.explanation, 200);
  const scene = clip(raw?.image_prompt, 700) || `${sound} in a scene about ${accepted.lemmaMeaning || input.meaning || ""}`;
  return {
    lemma: accepted.lemma,
    lemmaPhonetic: accepted.lemmaPhonetic,
    lemmaMeaning: accepted.lemmaMeaning,
    changed: accepted.changed,
    soundAnchor: sound,
    explanation,
    scene,
    fullImagePrompt: mnemonicImagePrompt(
      `The sound-anchor object "${sound}" (from "${accepted.lemmaPhonetic}", not a prefixed form) is a small prop. ${scene}`,
    ),
  };
}

export async function buildMnemonicConcept(word: any, language: string, invoke: LlmInvoke): Promise<MnemonicConcept> {
  const lang = String(word?.language || language || "hebrew");
  const fixed = storedMnemonicBase(word);
  const raw = await invoke({
    prompt: mnemonicConceptPrompt(word, lang, fixed),
    response_json_schema: MNEMONIC_CONCEPT_SCHEMA,
    model: "claude-haiku-4-5",
    max_tokens: 900,
  });
  return parseMnemonicConcept(raw, {
    language: lang,
    word: word?.word,
    phonetic: word?.phonetic,
    meaning: word?.translation,
  }, fixed);
}
