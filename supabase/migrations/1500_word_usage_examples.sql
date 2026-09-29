-- Three short usage examples per flashcard, shown under the word in Backpack.
--
-- Generated once by AI the first time the card is shown, then stored so they
-- aren't regenerated (and re-billed) on every visit. Shape:
--   [ { "hebrew_sentence": "...", "transliteration": "...", "english": "...",
--       "words": [ { "hebrew": "...", "word": "<transliteration>", "meaning": "..." } ] }, ... ]
-- NULL = not generated yet. No policy change: students already update their
-- own `word` rows.

begin;

alter table public.word
  add column if not exists usage_examples jsonb;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove the column):
-- ----------------------------------------------------------------------------
-- begin;
-- alter table public.word drop column if exists usage_examples;
-- commit;
