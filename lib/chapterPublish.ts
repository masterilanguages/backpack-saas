// Publishing a prepared chapter in chapter_content (read by every student).
//
// Only complete chapters are published: every sentence with its
// transliteration and English. A chapter with gaps stays unpublished (the
// video stays pending and can be prepared again) instead of relying on the
// app to fill the gaps later.
//
// The database settles races, not a read-then-write: chapter_content's
// primary key is video_id, so
//  - without force: INSERT … ON CONFLICT DO NOTHING — whichever run inserts
//    first wins; a later or simultaneous run never overwrites it;
//  - with force (an explicit rebuild): INSERT … ON CONFLICT DO UPDATE — the
//    complete new version replaces the old one in a single statement, so the
//    old one stays readable until then and is never deleted first.

/** Sentences missing their transliteration or English. */
export const untranslatedCount = (sentences: any[]) =>
  sentences.filter((x: any) => !String(x?.transliteration || "").trim() || !String(x?.english || "").trim()).length;

export type ChapterRow = { video_id: string; language: string; sentences: any[]; source: string };

/** Throws when the chapter is incomplete or the write fails. Returns whether this run's version is the published one. */
export async function publishChapter(db: any, row: ChapterRow, force: boolean, why = ""): Promise<"published" | "kept_existing"> {
  if (!row.sentences.length) throw new Error("not published: no sentences");
  const missing = untranslatedCount(row.sentences);
  if (missing) throw new Error(`not published: ${missing} of ${row.sentences.length} sentences untranslated${why}`);
  const { data, error } = await db
    .from("chapter_content")
    .upsert({ ...row, created_date: new Date().toISOString() }, { onConflict: "video_id", ignoreDuplicates: !force })
    .select("video_id");
  if (error) throw new Error(`save failed: ${error.message}`);
  // ON CONFLICT DO NOTHING returns no row when another run published first.
  return data?.length ? "published" : "kept_existing";
}
