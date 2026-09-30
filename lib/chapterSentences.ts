// Splits timed transcript fragments into short, complete sentences for the
// PATH chapter (steps 2–3, "Replay sentence").
//
// Transcription fragments are ~5 s slices that cut sentences in half and
// often hold several of them. Asking an AI to group them merged whole
// dialogues into 20–30 s "sentences". Instead: split on the transcript's own
// punctuation, give each piece a share of its fragment's time by length, join
// pieces up to a sentence end, then merge very short sentences ("שלום.") with
// the next one without making units too long.

export interface TimedFragment {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TimedSentence {
  text: string;
  start: number;
  end: number;
}

const SENTENCE_END = /[.?!…]["'”»)]?$/;
const MAX_SECONDS = 12; // a run with no punctuation is cut here
const SHORT_WORDS = 3; // sentences this short are merged with the next one
const MERGE_MAX_WORDS = 14;
const MERGE_MAX_SECONDS = 8;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

export function splitIntoSentences(frags: TimedFragment[], maxEnd = Infinity): TimedSentence[] {
  // The ASR occasionally repeats a bit of text as a fragment that jumps back
  // in time; drop those instead of splicing them into the wrong sentence.
  const sorted: TimedFragment[] = [];
  for (const f of frags) {
    if (!f.text.trim()) continue;
    const prev = sorted[sorted.length - 1];
    if (prev && f.start < prev.start) continue;
    sorted.push(f);
  }

  // 1 · Pieces: each fragment split at sentence punctuation, timed by length.
  const pieces: { text: string; start: number; end: number; ends: boolean }[] = [];
  sorted.forEach((f, i) => {
    const next = sorted[i + 1];
    const end = Math.max(f.start, Math.min(f.end, next ? next.start : f.end));
    const parts = f.text.match(/[^.?!…]+(?:[.?!…]+["'”»)]?|$)/g)?.map((p) => p.trim()).filter(Boolean) || [f.text.trim()];
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = f.start;
    for (const p of parts) {
      const d = ((end - f.start) * p.length) / total;
      pieces.push({ text: p, start: t, end: t + d, ends: SENTENCE_END.test(p) });
      t += d;
    }
  });

  // 2 · Sentences: pieces joined up to a sentence end (or MAX_SECONDS).
  const sentences: TimedSentence[] = [];
  let cur: TimedSentence | null = null;
  for (const p of pieces) {
    cur = cur ? { text: `${cur.text} ${p.text}`, start: cur.start, end: p.end } : { ...p };
    if (p.ends || cur.end - cur.start >= MAX_SECONDS) {
      sentences.push(cur);
      cur = null;
    }
  }
  if (cur) sentences.push(cur);

  // 3 · Merge very short sentences with the next one.
  const merged: TimedSentence[] = [];
  for (const s of sentences) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      words(prev.text) <= SHORT_WORDS &&
      words(prev.text) + words(s.text) <= MERGE_MAX_WORDS &&
      s.end - prev.start <= MERGE_MAX_SECONDS
    ) {
      prev.text = `${prev.text} ${s.text}`;
      prev.end = s.end;
    } else {
      merged.push({ ...s });
    }
  }

  return merged
    .filter((s) => s.start < maxEnd)
    .map((s) => ({ text: s.text.replace(/\s+/g, " ").trim(), start: s.start, end: Math.min(s.end, maxEnd) }));
}
