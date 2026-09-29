-- Remember which video a word was saved from, so Backpack can offer one deck
-- per video ("Flashcards from video ...", with its thumbnail and title).
--
-- source_video_id    : the YouTube video id (thumbnail = i.ytimg.com/vi/<id>/...)
-- source_video_title : the video title at save time (no join needed to show it)
--
-- Words saved before this migration (or from +, journal, songs...) keep both
-- NULL and appear under "Other words". No policy change: students already
-- insert/update their own `word` rows.

begin;

alter table public.word
  add column if not exists source_video_id    text,
  add column if not exists source_video_title text;

create index if not exists word_source_video_idx on public.word (created_by, source_video_id);

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove the columns):
-- ----------------------------------------------------------------------------
-- begin;
-- drop index if exists public.word_source_video_idx;
-- alter table public.word drop column if exists source_video_title, drop column if exists source_video_id;
-- commit;
