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

/** Turns canonical lyric lines plus aligned starts into chapter-ready segments. */
export function buildLyricSegments(lines: string[], starts: number[], finalEnd: number): LyricSegment[] {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  return cleanLines.map((text, index) => {
    const start = Number(starts[index] ?? 0);
    const nextStart = Number(starts[index + 1]);
    const end = Number.isFinite(nextStart) && nextStart > start ? nextStart : Math.max(start + 0.1, finalEnd);
    return { text, hebrew: text, transliteration: "", english: "", start, end };
  });
}
