-- Split `day_org_write` (FOR ALL) into per-command policies.
--
-- Why: /media's "Designate to Session" writes a video task into day.subsections
-- via UPDATE. The old FOR ALL policy required org-admin, so for the 12 students
-- and 2 coaches the UPDATE matched zero rows -- and PostgREST reports that as
-- success, not as an error. Product decision (MVP): let every org member attach
-- videos to a session; creating and deleting sessions stays with admins/owners.
--
-- The `org_id IS NULL` branch of the old policy is deliberately NOT carried over.
-- It was harmless there only because the second conjunct (has_org_role) rejected
-- it anyway; on an UPDATE policy without that conjunct it would let any
-- authenticated user write to an org-less row.
--
-- Cross-tenant safety does not rely on these policies alone: trg_freeze_org_id
-- raises on any attempt to change org_id, and trg_stamp_org_id fills it on insert.

begin;

drop policy if exists day_org_write on public.day;

-- Any member of the org may modify a session (i.e. add videos to subsections).
create policy day_org_update on public.day
  for update
  using      (org_id in (select my_org_ids()) or is_platform_admin())
  with check (org_id in (select my_org_ids()) or is_platform_admin());

-- Creating a session stays with org admins/owners.
create policy day_org_insert on public.day
  for insert
  with check ((org_id in (select my_org_ids()) or is_platform_admin())
              and (has_org_role(org_id, 'admin') or is_platform_admin()));

-- Deleting a session stays with org admins/owners.
create policy day_org_delete on public.day
  for delete
  using ((org_id in (select my_org_ids()) or is_platform_admin())
         and (has_org_role(org_id, 'admin') or is_platform_admin()));

commit;
