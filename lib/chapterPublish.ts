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
