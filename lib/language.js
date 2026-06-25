// Central target-language config so AI prompts and display adapt to the
// learner's chosen language (UserProfile.language) instead of assuming Hebrew.
//
// Design rule: Hebrew remains the default and behaves EXACTLY as before
// (Hebrew script + nikud + RTL + transliteration). These helpers only ADD
// support for the other target languages — they never remove Hebrew handling.
//
// Supported target languages: hebrew, english, spanish, french, portuguese, italian.

export const LANGUAGE_LABELS = {
  hebrew: 'Hebrew',
  english: 'English',
  spanish: 'Spanish',
  french: 'French',
  portuguese: 'Portuguese',
  italian: 'Italian',
};

// Human-readable language name for LLM prompts, e.g. "Hebrew", "Spanish".
export function languageLabel(lang) {
  const key = String(lang || '').toLowerCase();
  if (LANGUAGE_LABELS[key]) return LANGUAGE_LABELS[key];
  if (!key) return 'Hebrew';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Right-to-left scripts (Hebrew; Arabic if it ever appears).
export function isRTLLanguage(lang) {
  const key = String(lang || '').toLowerCase();
  return key === 'hebrew' || key === 'arabic';
}

// Nikud (vowel points) apply to Hebrew only.
export function usesNikud(lang) {
  return String(lang || '').toLowerCase() === 'hebrew';
}

// Detect RTL from actual text content (Hebrew + Arabic unicode ranges) —
// useful in display code where we have a word string but no language tag.
export function isRTLText(text) {
  return /[֐-׿؀-ۿ]/.test(String(text || ''));
}

// A prompt fragment describing the native script the model should output for
// the target language. Keep the surrounding JSON key names unchanged (callers
// still read a `hebrew`/`word` field) — only the wording targets the language.
export function nativeScriptInstruction(lang) {
  const label = languageLabel(lang);
  if (usesNikud(lang)) {
    return `the word in ${label} (Hebrew script WITH full nikud / vowel points)`;
  }
  return `the word in ${label} (correct native spelling, including any accents or diacritics)`;
}

// Whether a target language needs a separate transliteration line at all.
// Hebrew (and other non-Latin scripts) do; Latin-script languages generally
// already are their own transliteration.
export function needsTransliteration(lang) {
  const key = String(lang || '').toLowerCase();
  return key === 'hebrew' || key === 'arabic';
}
