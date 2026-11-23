// Platform speech facade. Schools teach whatever language the learner picked;
// Hebrew is the first romanizer. Other languages return the model's guess
// unchanged until a romanizer is registered beside hebrewRomanization.ts.
//
// Another client (a tenant app) can depend on the same shapes:
//   transliterate(source, { language, guess })
//   POST /api/speech/tts   { text, language, locale? }  → audio/mpeg
//   <SpeakButton text language locale? />

import { canonicalLanguage } from "./voices";
import { normalizeHebrewRomanization, polishSpeechFields, resolveHebrewTranslit, romanizeHebrew } from "./hebrewRomanization";
import { pointHebrew } from "./nikud";

export { canonicalLanguage, speechLocale, voiceProfile, VOICE_PROFILES } from "./voices";
export type { VoiceProfile } from "./voices";
export {
  clearTranslitCache,
  hasVowelNikud,
  normalizeHebrewRomanization,
  polishSpeechFields,
  resolveHebrewTranslit,
  romanizeHebrew,
} from "./hebrewRomanization";
export {
  hasNikud,
  NIKUD_PREFERENCE_KEY,
  pointHebrew,
  readNikudCache,
  stripNikud,
  writeNikudCache,
} from "./nikud";

/**
 * Nikud that pronounces as `transliteration`. Null when the points would not
 * round-trip to that Latin, so the caller can ask the model instead.
 */
export function vocalizeHebrew(hebrew: string, transliteration: string): string | null {
  const pointed = pointHebrew(hebrew, transliteration);
  if (!pointed) return null;
  const back = romanizeHebrew(pointed);
  const want = normalizeHebrewRomanization(transliteration);
  if (!back || !want || back !== want) return null;
  return pointed;
}

export type TransliterateOptions = {
  /** Learning-language id: "hebrew", "spanish", … */
  language?: string | null;
  /** Model guess, used when the source is not vocalized (or not Hebrew). */
  guess?: string | null;
};

/**
 * Latin reading of `source` for the learner's language.
 * Hebrew: Israeli romanization (deterministic when nikud is present).
 * Other languages: `guess`, trimmed. Latin-script languages are already readable.
 */
export function transliterate(source: string, opts: TransliterateOptions = {}): string {
  const guess = String(opts.guess ?? "");
  if (canonicalLanguage(opts.language) === "hebrew" || /[\u0590-\u05FF]/.test(source || "")) {
    return resolveHebrewTranslit(source || "", guess);
  }
  return guess.trim();
}

export { polishSpeechFields as polishTransliterations };
