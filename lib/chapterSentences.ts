// Groups timed transcript fragments into the PATH chapter's "sentences"
// (steps 2–3, "Replay sentence").
//
// Transcription fragments are ~5 s slices with REAL start/end times, but they
// often cut a sentence in half. Asking an AI to group them merged whole
// dialogues into 20–30 s blocks; splitting every sentence inside a fragment
// needs estimated times that can be ~0.5 s off. So: join whole fragments until
// one ends a sentence — every cut on a real fragment edge. Only when a unit
// passes SOFT_SECONDS without a sentence end at a fragment edge is it cut
// inside a fragment (at the first sentence end there, timed by text length).

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
const INNER_SENTENCE_END = /[.?!…]["'”»)]?(?=\s)/;
const SOFT_SECONDS = 8; // past this, cut inside a fragment if it has a sentence end
const HARD_SECONDS = 16; // past this, cut at the fragment edge regardless

export function splitIntoSentences(frags: TimedFragment[], maxEnd = Infinity): TimedSentence[] {
  // The ASR occasionally repeats a bit of text as a fragment that jumps back
  // in time; drop those. A fragment never runs past the next one's start.
  const clean: TimedFragment[] = [];
  for (const f of frags) {
    const text = f.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const prev = clean[clean.length - 1];
    if (prev && f.start < prev.start) continue;
    clean.push({ text, start: f.start, end: f.end });
  }
  clean.forEach((f, i) => {
    const next = clean[i + 1];
    if (next) f.end = Math.max(f.start, Math.min(f.end, next.start));
  });

  const out: TimedSentence[] = [];
  let cur: TimedSentence | null = null;
  for (const f of clean) {
    const before = cur ? `${cur.text} ` : "";
    cur = cur ? { text: `${cur.text} ${f.text}`, start: cur.start, end: f.end } : { ...f };

    if (SENTENCE_END.test(f.text)) {
      out.push(cur);
      cur = null;
      continue;
    }
    if (cur.end - cur.start >= SOFT_SECONDS) {
      const m = f.text.match(INNER_SENTENCE_END);
      if (m && m.index !== undefined) {
        const cut = m.index + m[0].length;
        const head = f.text.slice(0, cut).trim();
        const tail = f.text.slice(cut).trim();
        const at = f.start + ((f.end - f.start) * head.length) / Math.max(1, head.length + tail.length);
        out.push({ text: `${before}${head}`, start: cur.start, end: at });
        cur = tail ? { text: tail, start: at, end: f.end } : null;
      } else if (cur.end - cur.start >= HARD_SECONDS) {
        out.push(cur);
        cur = null;
      }
    }
  }
  if (cur) out.push(cur);

  return out
    .filter((s) => s.start < maxEnd && s.end > s.start)
    .map((s) => ({ text: s.text.replace(/\s+/g, " ").trim(), start: s.start, end: Math.min(s.end, maxEnd) }));
}
