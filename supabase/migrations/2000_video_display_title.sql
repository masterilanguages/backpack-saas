-- A title an admin sets by hand for a video in the student Library.
--
-- Why: the Library shows a short name + subtitle that AI derives from the
-- YouTube title, cached in each student's browser, so a wrong one can't be
-- fixed. When display_name is set, every student sees display_name /
-- display_subtitle instead; clearing it (null) brings the automatic one back.
--
-- Writing is governed by the existing policies: catalog rows (media_library)
-- by org admins/owners and platform admins, saved videos by their owner.

begin;

alter table public.media_library
  add column if not exists display_name     text,
  add column if not exists display_subtitle text;

alter table public.user_saved_video
  add column if not exists display_name     text,
  add column if not exists display_subtitle text;

commit;
