// The Latin (transliterated) words of a sentence, lined up one-to-one with its
// native-script words, for the sentence card's abc ⇄ א switch. Tapping the
// Latin word at index i is tapping the native word at index i, so both scripts
// open, translate and save the very same word.
//
// From the sentence's word glosses (`words`, one per native word, each with
// its `phonetic`) when they line up; a gloss without a phonetic takes the
// transliteration's word at the same place (when its word count matches) or,
// failing that, shows the native word itself — still tappable. Without
// aligned glosses: the transliteration when its word count matches; else null
// (the Latin line is shown but can't be tapped).

const TRAILING_MARKS = /[.,!?;:…"'”»)]+$/;

export function latinWords(
  nativeTokens: string[],
  glosses: Array<{ phonetic?: string } | null | undefined> | null | undefined,
  transliteration?: string | null,
): string[] | null {
  if (!nativeTokens.length) return null;
  const t = String(transliteration || "").split(/\s+/).filter(Boolean);
  const tAligned = t.length === nativeTokens.length;
  const g = Array.isArray(glosses) ? glosses : [];
  if (g.length === nativeTokens.length) {
    return g.map((w, i) => {
      const latin = String(w?.phonetic || "").trim();
      if (!latin) return tAligned ? t[i] : nativeTokens[i];
      // Glosses drop punctuation; carry the native word's trailing marks over.
      const marks = (nativeTokens[i].match(TRAILING_MARKS) || [""])[0];
      return marks && !latin.endsWith(marks) ? latin + marks : latin;
    });
  }
  return tAligned ? t : null;
}
