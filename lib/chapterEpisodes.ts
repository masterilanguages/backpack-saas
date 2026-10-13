// Splits a chapter's source (song, story, video) into ~30-second learning
// episodes. Every episode is ~30 s at every level: difficulty comes from the
// content, never from longer episodes.
//
// Episodes are cut only BETWEEN the prepared sentences (lib/chapterSentences,
// which carry real start/end times), so a cut can never land inside a word or
// a sentence. Among the candidate cuts, the 25–35 s window is preferred, then
// cuts after a sentence-ending mark or before a pause in the audio — pauses
// are where verses, choruses, musical phrases and scene changes end. Episodes
// are contiguous and together cover the whole source, in order: nothing is
// skipped, summarized or reordered (repeated choruses included).
//
// Deterministic: the same sentences always give the same episodes, so a
// student's per-episode progress stays attached to the same part of the source.

export const EPISODE_TARGET_SECONDS = 30;
export const EPISODE_MIN_SECONDS = 25;
export const EPISODE_MAX_SECONDS = 35;
// No episode shorter than this unless the whole source is.
const HARD_MIN_SECONDS = 15;

export interface EpisodeSentence {
  start: number;
  end: number;
  text?: string;
  hebrew?: string;
}

export interface Episode {
  number: number; // 1-based
  start: number; // seconds into the source
  end: number;
  first: number; // index of its first sentence
  last: number; // index of its last sentence (inclusive)
}

const SENTENCE_END = /[.?!…]["'”»)]?\s*$/;

/** Progress key of one episode in chapter_progress (no migration needed). */
export const episodeKey = (videoId: string, n: number) => `${videoId}#e${n}`;
export const isEpisodeKey = (key: string) => /#e\d+$/.test(key || "");

/**
 * @param sentences the chapter's timed sentences, in order
 * @param sourceEnd the source's length in seconds when known (so the last
 *   episode runs to the real end, e.g. an instrumental outro)
 */
export function splitIntoEpisodes(sentences: EpisodeSentence[], sourceEnd?: number): Episode[] {
  const s = (sentences || []).filter((x) => x && isFinite(x.start) && isFinite(x.end));
  if (!s.length) return [];
  const total = Math.max(sourceEnd && isFinite(sourceEnd) ? sourceEnd : 0, s[s.length - 1].end);

  // Where the cut after sentence k falls: just after it ends, keeping a little
  // of the pause as its tail, and never into the next sentence.
  const cutAfter = (k: number) => {
    const end = s[k].end;
    const next = s[k + 1]?.start ?? total;
    const gap = Math.max(0, next - end);
    return gap < 1.2 ? end + gap / 2 : end + 0.6;
  };
  const boundaryBonus = (k: number) => {
    const gap = Math.max(0, (s[k + 1]?.start ?? total) - s[k].end);
    let bonus = 0;
    if (SENTENCE_END.test(s[k].hebrew || s[k].text || "")) bonus += 3;
    if (gap >= 2.5) bonus += 5; // a real break: end of verse/chorus/scene
    else if (gap >= 1) bonus += 3; // a breath between phrases
    return bonus;
  };

  // Decide the count first (length ÷ 30 s), aim the cuts at evenly spaced
  // targets, then snap each target to the best natural break near it. Even
  // targets keep every episode close to 30 s — no 10-second sliver at the end
  // — and a 3:30 source becomes 7 episodes.
  const count = estimateEpisodeCount(total);
  if (count <= 1) return [{ number: 1, start: 0, end: total, first: 0, last: s.length - 1 }];
  const span = total / count;

  const episodes: Episode[] = [];
  let epStart = 0;
  let first = 0;
  for (let i = 1; i < count && first < s.length - 1; i++) {
    const target = i * span;
    let best = -1;
    let bestScore = Infinity;
    for (let k = first; k < s.length - 1; k++) {
      const cut = cutAfter(k);
      const d = cut - epStart;
      if (d < HARD_MIN_SECONDS) continue;
      if (total - cut < HARD_MIN_SECONDS) break; // leave the last episode its share
      let score = Math.abs(cut - target);
      if (d < EPISODE_MIN_SECONDS) score += (EPISODE_MIN_SECONDS - d) * 2;
      if (d > EPISODE_MAX_SECONDS) score += (d - EPISODE_MAX_SECONDS) * 2;
      score -= boundaryBonus(k);
      if (score < bestScore) { bestScore = score; best = k; }
      if (cut - target > span) break; // far past the target: nothing better ahead
    }
    if (best < 0) break; // no usable break left: the rest is the last episode
    const cut = cutAfter(best);
    episodes.push({ number: episodes.length + 1, start: epStart, end: cut, first, last: best });
    epStart = cut;
    first = best + 1;
  }
  episodes.push({ number: episodes.length + 1, start: epStart, end: total, first, last: s.length - 1 });
  return episodes;
}

/** Episode count before a source's sentences exist (≈ length / 30 s). */
export function estimateEpisodeCount(seconds: number): number {
  if (!seconds || !isFinite(seconds)) return 1;
  return Math.max(1, Math.round(seconds / EPISODE_TARGET_SECONDS));
}
