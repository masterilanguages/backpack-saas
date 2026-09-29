-- Per-card student review: the ✓ button on each flashcard.
--
-- A student can mark one of THEIR OWN cards as "approved" (green, locked for
-- them; only an admin can still edit it) or "rejected" (red, the card is wrong
-- or useless — surfaced to the admin under Vocabulary for fixing/deleting).
-- NULL = not reviewed. This is separate from `approved`, which is the admin-only
-- flag that shares a card with every student of that language.
--
-- No policy change: students already UPDATE their own `word` rows (ratings),
-- and this column rides on the same row.

begin;

alter table public.word
  add column if not exists review_status text
  check (review_status in ('approved', 'rejected'));

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove the column):
-- ----------------------------------------------------------------------------
-- begin;
-- alter table public.word drop column if exists review_status;
-- commit;
