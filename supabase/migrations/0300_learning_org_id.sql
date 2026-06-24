-- ============================================================
-- 0300_learning_org_id
-- ============================================================
-- Add the tenant axis (org_id) to the 34 LEARNING tables of the
-- live portal (project obxyaiaghotfglypagbc).
--
-- WHAT THIS MIGRATION DOES
--   1. Adds  org_id uuid  NULLABLE  references organizations(id)
--      to each of the 34 learning tables.            (no NOT NULL yet)
--   2. Backfills org_id = Masteri's org id where it is null.
--   3. Creates a NON-THROWING BEFORE INSERT trigger function
--      stamp_org_id() that auto-stamps org_id from my_org_id()
--      when the row does not provide one. If my_org_id() is null
--      (e.g. an unauthenticated / service context) it leaves
--      org_id null instead of raising -> never breaks an insert.
--   4. Creates a BEFORE UPDATE guard freeze_org_id() that PREVENTS
--      re-pointing a row to a different org once it is stamped.
--      This closes a cross-tenant REASSIGNMENT hole that the
--      still-permissive learning RLS would otherwise allow
--      (the old policies do not filter on org_id, so an anon
--      client could UPDATE ... SET org_id = '<another tenant>').
--   5. Attaches both triggers to all 34 tables.
--
-- WHAT THIS MIGRATION DOES *NOT* DO (on purpose, later migrations)
--   - It does NOT set org_id NOT NULL (data is still being backfilled
--     / the portal still inserts via anon and some paths may not yet
--     resolve a tenant). Enforcing NOT NULL is a separate, later step.
--   - It does NOT tighten the existing SELECT/ALL RLS policies. The
--     known cross-tenant READ leak (e.g. word_sel USING(true), and any
--     other USING(true)/created_by-only policy) is closed in a later
--     RLS migration, NOT here. TENANT ISOLATION IS NOT COMPLETE AFTER
--     0300: every learning row is still readable cross-tenant until the
--     RLS migration lands. The UPDATE guard above only stops WRITE-side
--     reassignment, not cross-tenant SELECT.
--
-- DEPENDENCIES (must already exist before applying 0300)
--   - table   public.organizations          (renamed from schools)
--   - column  organizations.slug            (Masteri seed = 'masteri')
--   - function public.my_org_id() returns uuid
--   These come from 0100_organizations_core. This file guards on their
--   existence and fails loudly with a clear message if they are missing,
--   rather than half-applying.
--
-- !!! ORDERING HAZARD (READ BEFORE APPLYING) !!!
--   0200_link_identity.sql ALREADY references coach_assignment.org_id
--   (it runs `update public.coach_assignment set org_id = ... where
--   org_id is null`). That column is created HERE, in 0300, which sorts
--   AFTER 0200. Applied in lexicographic order (0100 -> 0200 -> 0300)
--   0200 WILL FAIL with `column "org_id" does not exist`.
--   FIX BEFORE APPLYING TO ANY COPY (pick one):
--     (a) RENUMBER this file to run BEFORE 0200 (e.g. 0150_learning_org_id),
--         OR
--     (b) move the coach_assignment.org_id backfill out of 0200 into a
--         step that runs after this migration.
--   This migration is self-contained and idempotent either way; the
--   hazard is purely about apply ORDER across files.
--
-- IDEMPOTENT: safe to run more than once.
-- DOWN-migration: commented-out block at the very bottom.
-- DESTINATION REPO: backpack-saas/supabase/migrations/
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Preconditions: organizations table + my_org_id() must exist.
-- ------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.organizations') is null then
    raise exception
      '0300_learning_org_id: table public.organizations does not exist. Apply 0100_organizations_core (schools -> organizations) first.';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_org_id'
  ) then
    raise exception
      '0300_learning_org_id: function public.my_org_id() does not exist. Apply 0100_organizations_core (helpers) first.';
  end if;
end
$pre$;

-- ------------------------------------------------------------
-- 1. Add org_id (nullable) + FK to organizations on all 34 tables,
--    and 2. backfill it to the Masteri org where null.
--    Done in one pass per table via a server-side loop so the list
--    of tables lives in exactly one place.
-- ------------------------------------------------------------
do $main$
declare
  t            text;
  masteri_id   uuid;
  fk_name      text;
  learning_tables constant text[] := array[
    'achievement',
    'activity_progress',
    'chat_message',
    'coach_assignment',
    'coach_note',
    'conversation_session',
    'daily_song',
    'day',
    'day_progress',
    'fluent_lead',
    'journal_entry',
    'lesson_progress',
    'media_library',
    'picture_word',
    'practice_result',
    'singing_progress',
    'singing_recording',
    'singing_segment',
    'singing_song',
    'song',
    'song_progress',
    'story',
    'story_song',
    'study_session',
    'text_edit',
    'todo_item',
    'todo_progress',
    'user_coins',
    'user_profile',
    'user_program',
    'user_story_progress',
    'video',
    'vocab_exposure',
    'word'
  ];
begin
  -- Resolve Masteri's org id once (may be null if seed not migrated yet;
  -- in that case the backfill simply no-ops and rows stay null).
  select id into masteri_id from public.organizations where slug = 'masteri' limit 1;

  if masteri_id is null then
    raise warning
      '0300_learning_org_id: no organization with slug=''masteri'' found. Column will be added but backfill is skipped (org_id stays null).';
  end if;

  foreach t in array learning_tables
  loop
    -- Skip cleanly if a table is unexpectedly absent (defensive; the
    -- 34 names are taken from the read-only audit of the live DB).
    if to_regclass(format('public.%I', t)) is null then
      raise warning '0300_learning_org_id: table public.% not found, skipping.', t;
      continue;
    end if;

    -- 1a. Add the column (nullable). Idempotent.
    execute format(
      'alter table public.%I add column if not exists org_id uuid;', t
    );

    -- 1b. Add the FK to organizations(id) if not present yet. Idempotent.
    fk_name := t || '_org_id_fkey';
    if not exists (
      select 1
      from pg_constraint c
      join pg_class      r on r.oid = c.conrelid
      join pg_namespace  n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = t
        and c.conname = fk_name
    ) then
      execute format(
        'alter table public.%I
           add constraint %I
           foreign key (org_id) references public.organizations(id)
           on delete restrict;',
        t, fk_name
      );
    end if;

    -- 1c. Index org_id (RLS will filter on it; cheap to add now). Idempotent.
    execute format(
      'create index if not exists %I on public.%I (org_id);',
      t || '_org_id_idx', t
    );

    -- 2. Backfill to Masteri where null.
    if masteri_id is not null then
      execute format(
        'update public.%I set org_id = %L where org_id is null;',
        t, masteri_id
      );
    end if;
  end loop;
end
$main$;

-- ------------------------------------------------------------
-- 3a. NON-THROWING auto-stamp trigger function (BEFORE INSERT).
--     If the row did not set org_id, fill it from my_org_id().
--     If my_org_id() is null, DO NOT raise -> leave null.
--
--     SECURITY INVOKER (default): this function only writes NEW.org_id
--     and calls my_org_id(), which is itself SECURITY DEFINER and keys
--     off auth.uid(). It needs NO elevated privileges, so we do NOT make
--     it SECURITY DEFINER -- that would add 34 tables' worth of definer
--     surface for zero benefit. search_path is still pinned so the
--     unqualified/qualified lookups are deterministic regardless of the
--     caller's search_path (defense against search_path hijacking).
-- ------------------------------------------------------------
create or replace function public.stamp_org_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.org_id is null then
    -- my_org_id() may itself return null (no membership / no session);
    -- that is fine -- we deliberately leave org_id null and never throw.
    new.org_id := public.my_org_id();
  end if;
  return new;
end
$fn$;

comment on function public.stamp_org_id() is
  'BEFORE INSERT trigger: stamps org_id from my_org_id() when not provided. Non-throwing: if my_org_id() is null, leaves org_id null. SECURITY INVOKER, fixed search_path. Used by the 34 learning tables (migration 0300).';

-- ------------------------------------------------------------
-- 3b. CROSS-TENANT WRITE GUARD trigger function (BEFORE UPDATE).
--     Freezes org_id: once a row has a non-null org_id, an UPDATE may
--     NOT change it to a different org (and may not null it out).
--     WHY: the existing learning RLS policies (created_by / app_email /
--     several USING(true)) do NOT scope by org_id, so without this guard
--     an anon client could UPDATE someone else's-org row OR re-point its
--     OWN row into another tenant. This is the cheapest write-side
--     cross-tenant containment until the full RLS migration lands.
--     Setting org_id on a row that was previously null IS allowed
--     (one-time stamping / backfill catch-up).
-- ------------------------------------------------------------
create or replace function public.freeze_org_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if old.org_id is not null
     and new.org_id is distinct from old.org_id then
    raise exception
      'org_id is immutable once set (row %.% -> attempted % ): cross-tenant reassignment denied.',
      tg_table_name, old.org_id, new.org_id
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end
$fn$;

comment on function public.freeze_org_id() is
  'BEFORE UPDATE trigger: makes org_id immutable once non-null. Blocks cross-tenant reassignment from the client while learning RLS is still org-blind (migration 0300).';

-- ------------------------------------------------------------
-- 4. Attach both triggers to all 34 tables.
--    Drop-then-create per table so the migration is idempotent.
-- ------------------------------------------------------------
do $trg$
declare
  t text;
  learning_tables constant text[] := array[
    'achievement',
    'activity_progress',
    'chat_message',
    'coach_assignment',
    'coach_note',
    'conversation_session',
    'daily_song',
    'day',
    'day_progress',
    'fluent_lead',
    'journal_entry',
    'lesson_progress',
    'media_library',
    'picture_word',
    'practice_result',
    'singing_progress',
    'singing_recording',
    'singing_segment',
    'singing_song',
    'song',
    'song_progress',
    'story',
    'story_song',
    'study_session',
    'text_edit',
    'todo_item',
    'todo_progress',
    'user_coins',
    'user_profile',
    'user_program',
    'user_story_progress',
    'video',
    'vocab_exposure',
    'word'
  ];
begin
  foreach t in array learning_tables
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise warning '0300_learning_org_id: table public.% not found, triggers skipped.', t;
      continue;
    end if;

    execute format('drop trigger if exists trg_stamp_org_id on public.%I;', t);
    execute format(
      'create trigger trg_stamp_org_id
         before insert on public.%I
         for each row execute function public.stamp_org_id();',
      t
    );

    execute format('drop trigger if exists trg_freeze_org_id on public.%I;', t);
    execute format(
      'create trigger trg_freeze_org_id
         before update on public.%I
         for each row execute function public.freeze_org_id();',
      t
    );
  end loop;
end
$trg$;

commit;

-- ============================================================
-- DOWN MIGRATION (rollback) -- run manually to revert 0300.
-- Drops both triggers, both trigger functions, and the org_id
-- column (which also drops its FK constraint and index) from all
-- 34 learning tables. Idempotent. Entire block is inert (comments).
-- ============================================================
-- begin;
--
-- do $down$
-- declare
--   t text;
--   learning_tables constant text[] := array[
--     'achievement',
--     'activity_progress',
--     'chat_message',
--     'coach_assignment',
--     'coach_note',
--     'conversation_session',
--     'daily_song',
--     'day',
--     'day_progress',
--     'fluent_lead',
--     'journal_entry',
--     'lesson_progress',
--     'media_library',
--     'picture_word',
--     'practice_result',
--     'singing_progress',
--     'singing_recording',
--     'singing_segment',
--     'singing_song',
--     'song',
--     'song_progress',
--     'story',
--     'story_song',
--     'study_session',
--     'text_edit',
--     'todo_item',
--     'todo_progress',
--     'user_coins',
--     'user_profile',
--     'user_program',
--     'user_story_progress',
--     'video',
--     'vocab_exposure',
--     'word'
--   ];
-- begin
--   foreach t in array learning_tables
--   loop
--     if to_regclass(format('public.%I', t)) is null then
--       continue;
--     end if;
--     execute format('drop trigger if exists trg_stamp_org_id on public.%I;', t);
--     execute format('drop trigger if exists trg_freeze_org_id on public.%I;', t);
--     -- drop column cascades away the FK constraint and the org_id index
--     execute format('alter table public.%I drop column if exists org_id;', t);
--   end loop;
-- end
-- $down$;
--
-- drop function if exists public.stamp_org_id();
-- drop function if exists public.freeze_org_id();
--
-- commit;
-- ============================================================
