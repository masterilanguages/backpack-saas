-- The sentences of a PATH chapter (one row per video), with REAL timings.
--
-- Why: the video transcripts processed by the media page have AI-estimated
-- start times (~5–8 s per line) and are split in subtitle-sized fragments, so
-- "play this sentence" in chapter steps 2–3 played the wrong audio. A chapter
-- is now prepared once: timed captions from the transcription service (real
-- start + duration) are grouped by AI into complete sentences, each with its
-- real start/end, transliteration and English, limited to the first 3:30.
--
-- Shared by all students (prepared by whoever opens the chapter first).
-- sentences: [ { "start", "end", "hebrew", "transliteration", "english" } ]
-- Any signed-in user can read and insert; nobody can edit; platform admins can
-- delete a row to force it to be prepared again.

begin;

create table if not exists public.chapter_content (
  video_id     text primary key,
  language     text,
  sentences    jsonb not null,
  source       text,
  created_date timestamptz not null default now()
);

alter table public.chapter_content enable row level security;

drop policy if exists chapter_content_read on public.chapter_content;
create policy chapter_content_read on public.chapter_content
  for select to authenticated using (true);

drop policy if exists chapter_content_insert on public.chapter_content;
create policy chapter_content_insert on public.chapter_content
  for insert to authenticated with check (jsonb_typeof(sentences) = 'array');

drop policy if exists chapter_content_admin_delete on public.chapter_content;
create policy chapter_content_admin_delete on public.chapter_content
  for delete to authenticated using (public.is_platform_admin());

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove):
-- ----------------------------------------------------------------------------
-- begin;
-- drop table if exists public.chapter_content;
-- commit;
