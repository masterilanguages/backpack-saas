-- 0900 added `day_progress_day_id_fkey` (ON DELETE CASCADE) believing day_progress
-- had no foreign key on day_id. It did: `day_progress_day_id_fk`, with the default
-- NO ACTION. The check that missed it queried information_schema, which hides
-- constraints the querying role lacks privileges on; pg_constraint shows the truth.
--
-- Two FKs now sit on the same column with conflicting delete actions. Their RI
-- triggers fire in OID order, so the older NO ACTION check runs BEFORE the cascade
-- gets to clear the children -- deleting a day that any student has progress on
-- aborts with a foreign key violation instead of cascading.
--
-- Drop the redundant one. `day_progress_day_id_fkey` keeps the same reference plus
-- the ON DELETE CASCADE the delete-day button relies on.

begin;

alter table public.day_progress
  drop constraint if exists day_progress_day_id_fk;

commit;
