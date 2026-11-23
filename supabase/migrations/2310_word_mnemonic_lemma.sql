-- The dictionary form the mnemonic was built from.
-- word / phonetic stay the word the student saved (בבית / babait).
-- mnemonic_lemma / mnemonic_lemma_phonetic are the base (בית / bayit),
-- shown on the card when they differ. NULL = not decided yet.

begin;

alter table public.word
  add column if not exists mnemonic_lemma text,
  add column if not exists mnemonic_lemma_phonetic text,
  add column if not exists mnemonic_lemma_meaning text;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK:
-- begin;
-- alter table public.word
--   drop column if exists mnemonic_lemma,
--   drop column if exists mnemonic_lemma_phonetic,
--   drop column if exists mnemonic_lemma_meaning;
-- commit;
-- ----------------------------------------------------------------------------
