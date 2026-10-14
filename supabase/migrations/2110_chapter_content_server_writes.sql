-- chapter_content: everyone signed in reads it; only the server writes it.
--
-- Why: migration 1900 let ANY signed-in user insert a chapter (the app used to
-- prepare chapters in the browser) and platform admins delete one. Since
-- phase 2A the browser never prepares or writes a chapter: prepareChapter
-- publishes it through chapter_prep_publish (security definer, migration
-- 2100), which checks the run's lease and that the chapter is complete.
-- A student could otherwise publish (or squat) a chapter for any video.
--
-- After this migration:
--   anon            nothing
--   authenticated   SELECT only (students, staff and admins alike)
--   service_role    everything (edge functions)
--   chapter_prep_publish  writes as its owner, unaffected
--
-- Apply AFTER the phase 2A site is live (the old site's in-browser fallback
-- still inserts; with this applied it would just show the stored transcript).

begin;

drop policy if exists chapter_content_insert on public.chapter_content;
drop policy if exists chapter_content_admin_delete on public.chapter_content;

-- RLS already blocks writes without a policy; the privileges go too, so a
-- future permissive policy alone could not reopen them. Supabase's default
-- privileges had granted everything to anon and authenticated.
revoke insert, update, delete, truncate, references, trigger on public.chapter_content from anon, authenticated;
revoke select on public.chapter_content from anon;
grant select on public.chapter_content to authenticated;
grant all on public.chapter_content to service_role;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to restore the 1900 behavior):
-- ----------------------------------------------------------------------------
-- begin;
-- grant insert, delete on public.chapter_content to authenticated;
-- create policy chapter_content_insert on public.chapter_content
--   for insert to authenticated with check (jsonb_typeof(sentences) = 'array');
-- create policy chapter_content_admin_delete on public.chapter_content
--   for delete to authenticated using (public.is_platform_admin());
-- commit;
