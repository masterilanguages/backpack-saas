-- day_progress.day_id pointed at day.id with no foreign key at all, so deleting a
-- session would leave every student's progress row dangling. We're about to expose
-- a "delete day" button in the UI (the mutation existed but was never wired), so
-- the referential integrity has to exist first.
--
-- Safe to run: at authoring time day_progress had 2 rows and 0 orphans. The
-- delete below is a guard for any orphan created between then and the run --
-- without it, ADD CONSTRAINT fails.

begin;

delete from public.day_progress dp
where not exists (select 1 from public.day d where d.id = dp.day_id);

alter table public.day_progress
  add constraint day_progress_day_id_fkey
  foreign key (day_id) references public.day (id)
  on delete cascade;

commit;
