// Times the lines of a song's lyrics from speech-to-text word timings.
//
// The ASR (ElevenLabs) gives a start/end for every word it hears, but in songs
// it often mishears the words. The lyrics have the right words but no times.
// A global alignment of the two word sequences (Needleman–Wunsch) pairs every
// lyric word with an ASR word: words that look alike are anchors, and the
// misheard words between two anchors are paired by position — their timing is
// still right even when their spelling isn't. Each line then starts at its
// first paired word and ends at its last. Lines with no pair at all sit in the
// gap between their neighbours.

export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export interface LineTiming {
  start: number;
  end: number;
  // Lyric words of this line that matched an ASR word by spelling.
  anchors: number;
}

const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

/** Letters only: no niqqud, punctuation or case; Hebrew final forms folded. */
export function normWord(w: string): string {
  return String(w || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^0-9a-zÀ-ɏ֐-׿؀-ۿ]/g, "");
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

const ANCHOR = 0.6;       // similarity from which two words count as the same word
const GAP_LYRIC = -0.7;   // a lyric word with no ASR word (not sung / not heard)
const GAP_ASR = -0.4;     // an ASR word with no lyric word (ad-libs, repeats, noise)
const MISMATCH = -0.2;    // pairing two different words by position

/**
 * lines: each lyric line's native-script text, in order.
 * words: the ASR's timed words, in order (the whole audio).
 */
export function alignLinesToWords(lines: string[], words: TimedWord[]): LineTiming[] {
  const L: { line: number; w: string }[] = [];
  lines.forEach((text, line) => {
    for (const tok of String(text || "").split(/\s+/)) {
      const w = normWord(tok);
      if (w) L.push({ line, w });
    }
  });
  const A = words
    .map((x) => ({ ...x, w: normWord(x.text) }))
    .filter((x) => x.w && Number.isFinite(x.start) && Number.isFinite(x.end));
  const n = L.length, m = A.length;
  const out: LineTiming[] = lines.map(() => ({ start: NaN, end: NaN, anchors: 0 }));
  if (!n || !m) return fillGaps(out, A[0]?.start ?? 0, A[m - 1]?.end ?? 0);

  // Semi-global: ASR words before the first / after the last lyric word are
  // free (intro talk, applause, outro), so the lyrics can start anywhere.
  const score: Float64Array[] = [];
  const move: Uint8Array[] = []; // 0 diag, 1 up (skip lyric word), 2 left (skip ASR word)
  for (let i = 0; i <= n; i++) { score.push(new Float64Array(m + 1)); move.push(new Uint8Array(m + 1)); }
  for (let i = 1; i <= n; i++) { score[i][0] = score[i - 1][0] + GAP_LYRIC; move[i][0] = 1; }
  for (let j = 1; j <= m; j++) { score[0][j] = 0; move[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(L[i - 1].w, A[j - 1].w);
      const diag = score[i - 1][j - 1] + (sim >= ANCHOR ? 1 + sim : MISMATCH);
      const up = score[i - 1][j] + GAP_LYRIC;
      const left = score[i][j - 1] + (i === n ? 0 : GAP_ASR);
      if (diag >= up && diag >= left) { score[i][j] = diag; move[i][j] = 0; }
      else if (up >= left) { score[i][j] = up; move[i][j] = 1; }
      else { score[i][j] = left; move[i][j] = 2; }
    }
  }

  let i = n, j = m;
  while (i > 0 && j > 0) {
    const mv = move[i][j];
    if (mv === 0) {
      const lw = L[i - 1], aw = A[j - 1], t = out[lw.line];
      t.start = Number.isNaN(t.start) ? aw.start : Math.min(t.start, aw.start);
      t.end = Number.isNaN(t.end) ? aw.end : Math.max(t.end, aw.end);
      if (similarity(lw.w, aw.w) >= ANCHOR) t.anchors++;
      i--; j--;
    } else if (mv === 1) i--;
    else j--;
  }
  return fillGaps(out, A[0].start, A[m - 1].end);
}

// Lines that got no ASR word: share the gap between their timed neighbours.
// Also keeps every line after the previous one (no overlaps).
function fillGaps(t: LineTiming[], first: number, last: number): LineTiming[] {
  let k = 0;
  while (k < t.length) {
    if (!Number.isNaN(t[k].start)) { k++; continue; }
    let e = k;
    while (e < t.length && Number.isNaN(t[e].start)) e++;
    const from = k > 0 ? t[k - 1].end : first;
    const to = e < t.length ? t[e].start : Math.max(from + 2 * (e - k), last);
    const step = Math.max(0, to - from) / (e - k);
    for (let x = k; x < e; x++) t[x] = { start: from + step * (x - k), end: from + step * (x - k + 1), anchors: 0 };
    k = e;
  }
  for (let x = 1; x < t.length; x++) {
    if (t[x].start < t[x - 1].end) t[x].start = t[x - 1].end;
    if (t[x].end < t[x].start) t[x].end = t[x].start;
  }
  return t;
}

/** ASR fragments without word timings (fallback engines): words spread evenly over each fragment. */
export function wordsFromFragments(frags: { text: string; start: number; end: number }[]): TimedWord[] {
  const out: TimedWord[] = [];
  for (const f of frags) {
    const toks = String(f.text || "").split(/\s+/).filter(Boolean);
    const step = toks.length ? Math.max(0, f.end - f.start) / toks.length : 0;
    toks.forEach((text, k) => out.push({ text, start: f.start + step * k, end: f.start + step * (k + 1) }));
  }
  return out;
}
