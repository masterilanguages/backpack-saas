-- Per-student progress through a PATH chapter (one video = one chapter).
--
-- Step 1 "Watch for Meaning" ends by asking "How much did you understand?"
-- (1–100%); that answer is the chapter's baseline comprehension score.
-- final_score is reserved for step 4 (Final Uninterrupted Pass), so the app
-- can show "Before 42% → After 87%".
--
-- Same ownership/tenant model as user_saved_video (1000): created_by = the
-- user's email and org_id stamped by triggers; students read/write only their
-- own rows, org admins / coaches can read theirs.

begin;

create table if not exists public.chapter_progress (
  id             text primary key default replace(gen_random_uuid()::text, '-', ''),
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now(),
  created_by     text not null,
  org_id         uuid references public.organizations(id),
  video_id       text not null,          -- YouTube id of the chapter's video
  video_title    text,
  baseline_score smallint check (baseline_score between 1 and 100),
  baseline_at    timestamptz,
  final_score    smallint check (final_score between 1 and 100),
  final_at       timestamptz,
  unique (created_by, video_id)
);

drop trigger if exists chapter_progress_sys on public.chapter_progress;
create trigger chapter_progress_sys
  before insert or update on public.chapter_progress
  for each row execute function public.set_system_fields();

drop trigger if exists trg_stamp_org_id on public.chapter_progress;
create trigger trg_stamp_org_id
  before insert on public.chapter_progress
  for each row execute function public.stamp_org_id();

drop trigger if exists trg_freeze_org_id on public.chapter_progress;
create trigger trg_freeze_org_id
  before update on public.chapter_progress
  for each row execute function public.freeze_org_id();

alter table public.chapter_progress enable row level security;

drop policy if exists chapter_progress_org_select on public.chapter_progress;
create policy chapter_progress_org_select on public.chapter_progress
  for select using (
    (org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())
    and (
      public.app_role() = 'admin'
      or public.has_org_role(org_id, 'admin')
      or public.is_platform_admin()
      or created_by = public.app_email()
      or public.coach_of_email(created_by)
    )
  );

drop policy if exists chapter_progress_own_write on public.chapter_progress;
create policy chapter_progress_own_write on public.chapter_progress
  for all using (
    (org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())
    and created_by = public.app_email()
  )
  with check (
    (org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())
    and created_by = public.app_email()
  );

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove):
-- ----------------------------------------------------------------------------
-- begin;
-- drop table if exists public.chapter_progress;
-- commit;
