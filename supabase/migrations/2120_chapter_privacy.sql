-- A video's preparation status is visible only to people who can see the
-- video in a library (phase 2A, step 1). Nothing else changes.
--
-- Why: chapter_prep_status (2100) is SECURITY DEFINER, granted to every
-- signed-in user, and answers for ANY video id. Once prepareChapter writes
-- chapter_prep, anyone knowing the YouTube id of a video another student
-- saved privately could learn it is being prepared, and 'blocked' would tell
-- every student that the AI account has no credit. That information exists
-- only since phase 2A, so its protection ships with it.
--
-- Who can see a video is already decided by the libraries' RLS, which this
-- migration only CONSULTS (it changes no policy anywhere):
--   media_library     the school's catalog: its members (org_id among
--                     my_org_ids(), or no org) and platform admins
--   user_saved_video  a student's own videos: the student, their coach, the
--                     school's admins and platform admins
-- public.can_see_video() asks exactly that, AS THE CALLER (security invoker).
--
-- After this migration:
--   chapter_prep_status(id)  a row only if the caller can see the video;
--                            'blocked' reads 'failed' unless the caller is an
--                            admin (app role admin or platform admin).
--   UNCHANGED                chapter_content and its policies (read by every
--                            signed-in user, as since 1900), media_library,
--                            user_saved_video, schools, coaches, admins.
--   service_role             unchanged (bypasses RLS): prepareChapter keeps
--                            reading and writing everything.
--
-- The status is read from chapter_prep (no policies, no grants to students)
-- by private.chapter_prep_status_raw(), SECURITY DEFINER, in the `private`
-- schema. Signed-in users may execute it (the public function runs as them
-- and calls it), but the API exposes only its configured schemas (public,
-- graphql_public): `private` must NOT be added to the Data API's exposed
-- schemas, as Supabase advises for security definer functions.

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

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to restore 2100 exactly; nothing else was changed):
-- ----------------------------------------------------------------------------
-- begin;
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
