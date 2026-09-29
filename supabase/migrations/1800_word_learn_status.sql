-- Backpack Words · Select step: every word the chapter brings in (recommended
-- vocabulary + words the student tapped) enters as "new" and is not yet part
-- of permanent study. The student quickly decides: Learn (swipe right) or
-- Skip (swipe left), optionally with a priority (1–5) — which is NOT a measure
-- of how well they know the word.
--
-- learn_status     : 'new' | 'learning' | 'skipped'. NULL = words that existed
--                    before this (already in study) — treated as 'learning'.
-- priority         : optional 1–5 set by the student when choosing Learn.
-- learn_decided_at : when the student chose Learn/Skip.
-- (Separate from word_status, which the journal uses: 'new' | 'saved'.)

begin;

alter table public.word
  add column if not exists learn_status text check (learn_status in ('new', 'learning', 'skipped')),
  add column if not exists priority smallint check (priority between 1 and 5),
  add column if not exists learn_decided_at timestamptz;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove):
-- ----------------------------------------------------------------------------
-- begin;
-- alter table public.word
--   drop column if exists learn_status,
--   drop column if exists priority,
--   drop column if exists learn_decided_at;
-- commit;
