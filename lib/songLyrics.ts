export interface LyricSegment {
  text: string;
  hebrew: string;
  transliteration: string;
  english: string;
  start: number;
  end: number;
}

/** Rehydrates usable ASR text/timestamps from a previously saved video. */
export function timedSegmentsFromSavedTranscript(saved: any[]): Array<{ text: string; start: number }> {
  return (Array.isArray(saved) ? saved : [])
    .map((segment: any) => ({
      text: String(segment?.text || segment?.hebrew || segment?.transliteration || "").trim(),
      start: Number(segment?.start) || 0,
    }))
    .filter((segment) => segment.text);
}

/** A prepared chapter must be rebuilt if its canonical lyric text changed. */
export function shouldRefreshChapter(importedLyrics: boolean, transcriptLineCount: number): boolean {
  return importedLyrics && transcriptLineCount > 0;
}

/** chapter_content is keyed by video_id, unlike most entity tables. */
export function chapterContentKey(chapter: { video_id?: unknown; id?: unknown }): string {
  return String(chapter.video_id || chapter.id || "");
}

const NATIVE_SCRIPT = /[֐-׿؀-ۿ]/;
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/;

/**
 * Letras.com prints a Hebrew verse and its romanization side by side, so one
 * extracted line can be "בן אדם, מה לך נרדםben adam, ma lecha nirdam". Splits it
 * at the end of the native-script run: the native text and its Latin reading.
 * Lines in a single script come back unchanged (latin = "").
 */
export function splitScriptLine(line: string): { native: string; latin: string } {
  const text = String(line || "").trim();
  if (!NATIVE_SCRIPT.test(text) || !LATIN_LETTER.test(text)) return { native: text, latin: "" };
  let lastNative = -1;
  for (let i = 0; i < text.length; i++) if (NATIVE_SCRIPT.test(text[i])) lastNative = i;
  const rest = text.slice(lastNative + 1);
  const firstLatin = rest.search(LATIN_LETTER);
  if (firstLatin < 0) return { native: text, latin: "" };
  // Punctuation right after the native run ("?", ",", ".") stays with it.
  const native = (text.slice(0, lastNative + 1) + rest.slice(0, firstLatin)).trim();
  const latin = rest.slice(firstLatin).trim();
  return native && latin ? { native, latin } : { native: text, latin: "" };
}

/** Turns canonical lyric lines plus aligned starts into chapter-ready segments. */
export function buildLyricSegments(lines: string[], starts: number[], finalEnd: number): LyricSegment[] {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  return cleanLines.map((line, index) => {
    const start = Number(starts[index] ?? 0);
    const nextStart = Number(starts[index + 1]);
    const end = Number.isFinite(nextStart) && nextStart > start ? nextStart : Math.max(start + 0.1, finalEnd);
    const { native, latin } = splitScriptLine(line);
    return { text: native, hebrew: native, transliteration: latin, english: "", start, end };
  });
}
