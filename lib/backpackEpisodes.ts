// Which episode of its source video a Backpack word came from.
//
// A saved word keeps its video (source_video_id) and the sentence it was
// tapped in (example_sentence), not the episode. The episode is found by
// looking that sentence up in the video's prepared chapter: the sentence's
// index falls inside exactly one episode (Episode.first..last).
//
// Matching ignores niqqud, punctuation, spacing and Hebrew final forms, so a
// sentence saved with or without vowels still matches. A word whose sentence
// isn't in the chapter (saved from an older transcript, or by hand) gets
// null and is listed under "Other words from this video".
// Pure: no imports (same letter folding as lib/lyricAlign normWord).

const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const normSentence = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^0-9a-zÀ-ɏ֐-׿؀-ۿ]/g, "");

export function sentenceEpisodeIndex(
  sentences: { text?: string; hebrew?: string; transliteration?: string }[],
  episodes: { number: number; first: number; last: number }[],
): Map<string, number> {
  const byText = new Map<string, number>();
  for (const ep of episodes) {
    for (let i = ep.first; i <= ep.last && i < sentences.length; i++) {
      const s = sentences[i] || {};
      for (const t of [s.hebrew, s.text, s.transliteration]) {
        const k = normSentence(t || "");
        // The first episode a repeated line (a chorus) appears in wins.
        if (k && !byText.has(k)) byText.set(k, ep.number);
      }
    }
  }
  return byText;
}

/** The episode number of a word, or null when its sentence isn't found. */
export function wordEpisode(word: { example_sentence?: string | null }, index: Map<string, number>): number | null {
  const k = normSentence(word?.example_sentence || "");
  if (!k) return null;
  const exact = index.get(k);
  if (exact != null) return exact;
  // A sentence saved as part of a longer line (or the other way round).
  if (k.length < 6) return null;
  for (const [text, n] of index) {
    if (text.length >= 6 && (text.includes(k) || k.includes(text))) return n;
  }
  return null;
}
