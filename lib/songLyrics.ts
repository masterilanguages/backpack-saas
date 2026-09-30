export interface LyricSegment {
  text: string;
  hebrew: string;
  transliteration: string;
  english: string;
  start: number;
  end: number;
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
