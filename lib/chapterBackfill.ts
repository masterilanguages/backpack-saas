// Which library videos Media → "Prepare all chapters" sends to the server:
// only those with no prepared chapter at all, once each (the library can list
// the same YouTube video twice). A video that already has a chapter is never
// included, whatever that chapter's length: rebuilding one is a paid
// transcription and must be its own explicit admin action.

export function videosNeedingChapter<T extends { video_id?: string | null }>(videos: T[], preparedVideoIds: Iterable<string>): T[] {
  const prepared = new Set(preparedVideoIds);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of videos || []) {
    const id = v?.video_id;
    if (!id || seen.has(id) || prepared.has(id)) continue;
    seen.add(id);
    out.push(v);
  }
  return out;
}
