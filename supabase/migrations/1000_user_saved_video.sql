-- ============================================================
-- 1000_user_saved_video   (ALREADY APPLIED to prod 2026-07-09 via CLI)
-- ============================================================
-- Adds a personal, per-user video collection so every user (not just
-- admin/coach) can add videos to -- and delete them from -- their own
-- account, without touching the admin-curated `media_library` catalog.
-- media_library write stays admin/owner-of-org-only per 0400_rls_reconcile
-- (deliberate: it is shared platform content, not personal data).
--
-- Approval flow: org admins can read every student's rows (RLS below), so
-- /media shows them a "Student submissions" queue. Approve = the admin
-- copies the row into media_library (allowed by the admin-only catalog
-- policy) and deletes the personal row.
--
-- Mirrors the subset of media_library's columns the Content Library UI
-- reads (title/language/video_url/video_id/topics/difficulty_level/
-- duration_minutes/tags/thumbnail_url/notes/processed_transcript/
-- session_vocab_words) so the existing video-card, filter, and
-- transcript-playback code paths work unmodified for personal rows.
--
-- Ownership follows the same pattern as the other "student data" tables
-- (e.g. word, journal_entry): created_by = owner email, stamped by the
-- existing set_system_fields() trigger; RLS restricts read/write to the
-- owner (+ their coach + org/platform admin) -- NOT the catalog-wide
-- admin-only write rule those tables use.
--
-- IDEMPOTENT. ADDITIVE. DOWN-migration commented at the end.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.media_library') is null then
    raise exception '1000_user_saved_video: media_library not found -- apply earlier migrations first.';
  end if;
  if to_regclass('public.organizations') is null then
    raise exception '1000_user_saved_video: organizations not found -- apply 0100_organizations_core first.';
  end if;
end$$;

create table if not exists public.user_saved_video (
  id                   text primary key default replace(gen_random_uuid()::text, '-', ''),
  created_date         timestamptz not null default now(),
  updated_date         timestamptz not null default now(),
  created_by           text not null,
  org_id               uuid references public.organizations(id),
  title                text not null,
  language             text,
  video_url            text not null,
  video_id             text,
  thumbnail_url        text,
  topics               text[] default '{}',
  difficulty_level     text default 'All',
  duration_minutes     numeric,
  tags                 text,
  notes                text,
  processed_transcript jsonb default '[]',
  session_vocab_words  jsonb default '[]'
);

comment on table public.user_saved_video is
  'Personal video collection: any user may add/delete their own rows. Separate from the admin-curated media_library catalog (media_library write stays admin-only).';

-- System-fields trigger (id/created_date/created_by/updated_date) -- same
-- function every other learning table uses (see word_sys, and the trigger
-- comment in api/base44Client.js re: created_by being stamped server-side).
drop trigger if exists user_saved_video_sys on public.user_saved_video;
create trigger user_saved_video_sys
  before insert or update on public.user_saved_video
  for each row execute function public.set_system_fields();

-- org_id stamping + immutability, same as the other 34 learning tables
-- (migration 0300_learning_org_id).
drop trigger if exists trg_stamp_org_id on public.user_saved_video;
create trigger trg_stamp_org_id
  before insert on public.user_saved_video
  for each row execute function public.stamp_org_id();

drop trigger if exists trg_freeze_org_id on public.user_saved_video;
create trigger trg_freeze_org_id
  before update on public.user_saved_video
  for each row execute function public.freeze_org_id();

-- RLS: "student data" pattern (NOT the catalog pattern media_library uses)
-- -- owner (created_by), their coach, or org/platform admin. Mirrors
-- word_org_select / word_org_write from 0400_rls_reconcile.
alter table public.user_saved_video enable row level security;

drop policy if exists user_saved_video_org_select on public.user_saved_video;
create policy user_saved_video_org_select on public.user_saved_video
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

drop policy if exists user_saved_video_org_write on public.user_saved_video;
create policy user_saved_video_org_write on public.user_saved_video
  for all using (
    (org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())
    and (
      public.app_role() = 'admin'
      or public.has_org_role(org_id, 'admin')
      or public.is_platform_admin()
      or created_by = public.app_email()
      or public.coach_of_email(created_by)
    )
  )
  with check (
    (org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())
    and (
      public.app_role() = 'admin'
      or public.has_org_role(org_id, 'admin')
      or public.is_platform_admin()
      or created_by = public.app_email()
      or public.coach_of_email(created_by)
    )
  );

commit;

-- ============================================================
-- DOWN-MIGRATION (rollback) -- uncomment to revert.
-- ============================================================
-- begin;
--   drop table if exists public.user_saved_video;
-- commit;
-- ============================================================
