-- Chapters and their preparation status are visible only to people who can
-- see the video in a library (phase 2A, step 1).
--
-- Why: chapter_prep_status (2100) is SECURITY DEFINER, granted to every
-- signed-in user, and answered for ANY video id: anyone who knew the YouTube
-- id of a video another student saved privately could learn that it is in the
-- system and its state ('blocked' even tells that the AI account is out of
-- credit). And chapter_content (1900) could be read by every signed-in user,
-- for every video.
--
-- Who can see a video is already decided by the RLS of the two libraries,
-- and nothing new is invented here:
--   media_library     the school's catalog: its members (org_id among
--                     my_org_ids(), or no org) and platform admins
--   user_saved_video  a student's own videos: the student, their coach, the
--                     school's admins and platform admins
-- public.can_see_video() asks exactly that, AS THE CALLER (security
-- invoker), so those policies decide. Two students who saved the same
-- YouTube video both see its (shared) chapter. Nobody learns who else saved it.
--
-- After this migration:
--   chapter_prep_status(id)  a row only if the caller can see the video;
--                            'blocked' reads 'failed' unless the caller is an
--                            admin (app role admin or platform admin).
--   chapter_content          SELECT only for videos the caller can see
--                            (platform admins: all). Writes unchanged here
--                            (2110 closes them later).
--   service_role             unchanged (bypasses RLS): prepareChapter keeps
--                            reading and writing everything.
--
-- The status itself is read from chapter_prep (no policies, no grants to
-- students) by private.chapter_prep_status_raw(), SECURITY DEFINER, in a
-- schema the API doesn't expose: students can't call it directly.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Can the caller see this video in a library? Runs with the caller's rights,
-- so the libraries' own RLS decides.
create or replace function public.can_see_video(p_video_id text)
returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.media_library m where m.video_id = p_video_id)
      or exists (select 1 from public.user_saved_video u where u.video_id = p_video_id);
$$;
revoke all on function public.can_see_video(text) from public, anon;
grant execute on function public.can_see_video(text) to authenticated, service_role;

-- The status as 2100 computed it (unchanged), readable only through the
-- public function below.
create or replace function private.chapter_prep_status_raw(p_video_id text)
returns table (status text, busy boolean, resumable boolean)
language sql stable security definer set search_path = public as $$
  select cp.status,
         coalesce(cp.locked_until > now(), false),
         (coalesce(cp.locked_until <= now(), true)
          and cp.attempts < 5
          and (cp.status in ('queued','transcribing','translating','publishing','pending_recovery')
               or (cp.status = 'failed'
                   and cp.error_kind in ('rate_limit','overloaded','timeout','lease_lost','incomplete','unknown'))))
  from public.chapter_prep cp where cp.video_id = p_video_id;
$$;
revoke all on function private.chapter_prep_status_raw(text) from public, anon;
grant execute on function private.chapter_prep_status_raw(text) to authenticated, service_role;

-- Same name, arguments and result as 2100, so the app needs no change; now
-- SECURITY INVOKER and answering only for videos the caller can see.
create or replace function public.chapter_prep_status(p_video_id text)
returns table (status text, busy boolean, resumable boolean)
language sql stable security invoker set search_path = public as $$
  select case
           when s.status = 'blocked' and not (public.is_platform_admin() or public.app_role() = 'admin') then 'failed'
           else s.status
         end,
         s.busy,
         s.resumable
  from private.chapter_prep_status_raw(p_video_id) s
  where public.is_platform_admin() or public.can_see_video(p_video_id);
$$;
revoke all on function public.chapter_prep_status(text) from public, anon;
grant execute on function public.chapter_prep_status(text) to authenticated, service_role;

-- Chapters: readable only for videos the caller can see.
drop policy if exists chapter_content_read on public.chapter_content;
create policy chapter_content_read on public.chapter_content
  for select to authenticated
  using (public.is_platform_admin() or public.can_see_video(video_id));

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to restore 2100 / 1900 exactly):
-- ----------------------------------------------------------------------------
-- begin;
-- drop policy if exists chapter_content_read on public.chapter_content;
-- create policy chapter_content_read on public.chapter_content
--   for select to authenticated using (true);
-- create or replace function public.chapter_prep_status(p_video_id text)
-- returns table (status text, busy boolean, resumable boolean)
-- language sql stable security definer set search_path = public as $$
--   select cp.status,
--          coalesce(cp.locked_until > now(), false),
--          (coalesce(cp.locked_until <= now(), true)
--           and cp.attempts < 5
--           and (cp.status in ('queued','transcribing','translating','publishing','pending_recovery')
--                or (cp.status = 'failed'
--                    and cp.error_kind in ('rate_limit','overloaded','timeout','lease_lost','incomplete','unknown'))))
--   from public.chapter_prep cp where cp.video_id = p_video_id;
-- $$;
-- revoke all on function public.chapter_prep_status(text) from public, anon;
-- grant execute on function public.chapter_prep_status(text) to authenticated, service_role;
-- drop function if exists private.chapter_prep_status_raw(text);
-- drop function if exists public.can_see_video(text);
-- drop schema if exists private;
-- commit;
