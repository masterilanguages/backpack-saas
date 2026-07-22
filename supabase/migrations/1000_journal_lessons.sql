-- ============================================================================
-- 1000_journal_lessons.sql
-- ============================================================================
-- GOAL
--   Extend the existing `journal_entry` table so it can back the new Backpack
--   Journal feature: the learner writes a personal entry, then Backpack turns it
--   into a target-language lesson (natural target text, English translation,
--   transliteration, key vocabulary, speaking prompts, mnemonic hooks).
--
--   The whole generated lesson is stored as a single `lesson` jsonb blob so the
--   shape can evolve without further migrations. A handful of scalar columns are
--   added alongside it purely so the Journal list can filter/sort/label entries
--   (title, target language, status, date) without parsing the blob.
--
-- WHY THIS MIGRATION IS NEEDED
--   The base44->Supabase shim (api/base44Client.js) SILENTLY DROPS any column it
--   writes that doesn't exist on the table (it mirrors Base44's leniency). So
--   without these columns, saving a generated lesson would "succeed" while every
--   new field vanished. Adding the columns makes the writes persist.
--
-- SAFETY
--   * All columns are added IF NOT EXISTS and are NULLABLE, so existing rows
--     (the previous "Daily Journal" entries) are untouched and keep working.
--   * No RLS changes: journal_entry already restricts rows to their owner via
--     the existing created_by policies; new columns inherit that automatically.
--   * `word` gets a few optional provenance columns so a vocabulary item saved
--     from a lesson can remember where it came from. They are nullable and the
--     UI works with or without them.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- journal_entry: lesson payload + list/label scalars
-- ---------------------------------------------------------------------------
alter table public.journal_entry
  add column if not exists title              text,
  add column if not exists original_language  text,
  add column if not exists target_language    text,
  add column if not exists level              text,
  add column if not exists tone               text,
  add column if not exists focus              text,
  add column if not exists status             text,   -- 'draft' | 'generated' | 'saved_to_library'
  add column if not exists library_item_id    text,   -- reserved: link to a Library item (future)
  add column if not exists lesson             jsonb;  -- full generated lesson (see lib/journal/generateLesson.ts)

-- Speeds up the "my journal entries, newest first" list query.
create index if not exists journal_entry_created_by_status_idx
  on public.journal_entry (created_by, status);

-- ---------------------------------------------------------------------------
-- word: optional provenance for vocabulary saved from a journal lesson
-- ---------------------------------------------------------------------------
alter table public.word
  add column if not exists source_journal_entry_id  uuid,
  add column if not exists source_library_lesson_id text,
  add column if not exists sentence_context         text,
  add column if not exists word_status              text;   -- 'new' | 'saved'

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to drop the added columns):
-- ----------------------------------------------------------------------------
-- begin;
-- drop index if exists public.journal_entry_created_by_status_idx;
-- alter table public.journal_entry
--   drop column if exists title,
--   drop column if exists original_language,
--   drop column if exists target_language,
--   drop column if exists level,
--   drop column if exists tone,
--   drop column if exists focus,
--   drop column if exists status,
--   drop column if exists library_item_id,
--   drop column if exists lesson;
-- alter table public.word
--   drop column if exists source_journal_entry_id,
--   drop column if exists source_library_lesson_id,
--   drop column if exists sentence_context,
--   drop column if exists word_status;
-- commit;
