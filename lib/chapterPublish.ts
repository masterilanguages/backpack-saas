// Only complete chapters are published in chapter_content (read by every
// student): every sentence with its transliteration and English. A chapter
// with gaps stays unpublished (the video stays pending and can be prepared
// again) instead of relying on the app to fill the gaps later.
//
// The server publishes through chapter_prep_publish (migration 2100), which
// checks this again in SQL, together with the run's lease, in one
// transaction: without force it never overwrites a published chapter; with
// force it replaces it in a single statement, never deleting it first.

/** Sentences missing their transliteration or English. */
export const untranslatedCount = (sentences: any[]) =>
  sentences.filter((x: any) => !String(x?.transliteration || "").trim() || !String(x?.english || "").trim()).length;

// A sentence made only of digits, spaces and ASCII punctuation (e.g. "24",
// "...") has no word to gloss; any other sentence needs at least one gloss,
// or its words couldn't be tapped and the app would ask the AI on opening.
// Same rule as chapter_prep_publish (migration 2121).
const NOTHING_TO_GLOSS = /^[\s0-9!-\/:-@\[-`{-~]*$/;

/** Sentences with something to gloss but no word glosses. */
export const glosslessCount = (sentences: any[]) =>
  sentences.filter((x: any) => {
    const text = String(x?.text || x?.hebrew || "");
    return !NOTHING_TO_GLOSS.test(text) && !(Array.isArray(x?.words) && x.words.length > 0);
  }).length;

/** Sentences not ready for students: no transliteration, English or glosses. */
export const incompleteCount = (sentences: any[]) =>
  sentences.filter((x: any) => untranslatedCount([x]) > 0 || glosslessCount([x]) > 0).length;
