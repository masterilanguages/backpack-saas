-- Let every org member CREATE a session (day row), not just admins.
--
-- Why: the Schedule renders Sessions 1-5 from a code-defined template, and a
-- session's progress/custom tasks need a real `day` row to hang on. The row is
-- created lazily on first interaction (ensureDayRow in the Schedule page).
-- With INSERT restricted to admins (0800), a student tapping a checkbox in a
-- not-yet-initialized session hit "ask your teacher to open it once".
-- Product decision: users get the same schedule controls as admins — so
-- member INSERT mirrors the member UPDATE policy from 0800.
--
-- Deleting sessions stays admin-only (day_org_delete unchanged): a delete
-- cascades into every student's day_progress, which is not a member-level
-- control. Cross-tenant safety unchanged: trg_stamp_org_id fills org_id on
-- insert, trg_freeze_org_id blocks re-pointing it, and the with_check confines
-- writes to the member's own org(s).

begin;

drop policy if exists day_org_insert on public.day;

create policy day_org_insert on public.day
  for insert
  with check (org_id in (select my_org_ids()) or is_platform_admin());

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to restore admin-only session creation):
-- ----------------------------------------------------------------------------
-- begin;
-- drop policy if exists day_org_insert on public.day;
-- create policy day_org_insert on public.day
--   for insert
--   with check ((org_id in (select my_org_ids()) or is_platform_admin())
--               and (has_org_role(org_id, 'admin') or is_platform_admin()));
-- commit;
