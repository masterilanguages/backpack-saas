-- Rating history: one row every time a student rates a word (1–5 buttons,
-- session cards, practice games — anything that changes word.times_practiced).
--
-- Why: word.times_practiced only holds the CURRENT level, overwritten on every
-- rating, so the admin could not tell when a student studied, how often a word
-- was reviewed, or how it progressed. A trigger records every change, so no
-- client code path can forget to log it.
--
-- Access: RLS is on with no policies, so students/anon can't read or write the
-- table directly. The trigger function is SECURITY DEFINER; the admin panel
-- reads through the service role. The two views are security_invoker, so they
-- inherit the same restriction.

begin;

-- word_id / org_id copy the exact column types of public.word, whatever they are.
do $$
declare
  id_type  text;
  org_type text;
begin
  select format_type(atttypid, atttypmod) into id_type
    from pg_attribute where attrelid = 'public.word'::regclass and attname = 'id';
  select format_type(atttypid, atttypmod) into org_type
    from pg_attribute where attrelid = 'public.word'::regclass and attname = 'org_id';

  execute format($ddl$
    create table if not exists public.word_rating_event (
      id              bigint generated always as identity primary key,
      word_id         %s references public.word(id) on delete set null,
      org_id          %s,
      created_by      text,
      rating          smallint not null,
      previous_rating smallint,
      created_at      timestamptz not null default now()
    )$ddl$, id_type, org_type);
end
$$;

create index if not exists word_rating_event_word_idx    on public.word_rating_event (word_id);
create index if not exists word_rating_event_org_at_idx  on public.word_rating_event (org_id, created_at desc);

alter table public.word_rating_event enable row level security;
revoke all on public.word_rating_event from anon, authenticated;

create or replace function public.log_word_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- A new word saved without a rating is not a practice.
    if coalesce(new.times_practiced, 0) = 0 then
      return new;
    end if;
  elsif new.times_practiced is not distinct from old.times_practiced then
    return new;
  end if;

  insert into public.word_rating_event (word_id, org_id, created_by, rating, previous_rating)
  values (
    new.id,
    new.org_id,
    new.created_by,
    coalesce(new.times_practiced, 0),
    case when tg_op = 'UPDATE' then old.times_practiced end
  );
  return new;
end
$$;

drop trigger if exists trg_log_word_rating on public.word;
create trigger trg_log_word_rating
  after insert or update of times_practiced on public.word
  for each row execute function public.log_word_rating();

-- Per word: how many times it was rated and when last (resets to 0 excluded).
create or replace view public.word_rating_stats
with (security_invoker = true) as
select word_id,
       org_id,
       count(*)::int   as times_rated,
       max(created_at) as last_rated_at
  from public.word_rating_event
 where rating > 0 and word_id is not null
 group by word_id, org_id;

-- Per student: recent study activity.
create or replace view public.student_rating_activity
with (security_invoker = true) as
select org_id,
       lower(trim(created_by)) as email,
       (count(*) filter (where created_at > now() - interval '24 hours'))::int as ratings_24h,
       (count(*) filter (where created_at > now() - interval '7 days'))::int   as ratings_7d,
       max(created_at) as last_rated_at
  from public.word_rating_event
 where rating > 0
 group by org_id, lower(trim(created_by));

revoke all on public.word_rating_stats, public.student_rating_activity from anon, authenticated;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove the rating history):
-- ----------------------------------------------------------------------------
-- begin;
-- drop trigger if exists trg_log_word_rating on public.word;
-- drop function if exists public.log_word_rating();
-- drop view if exists public.student_rating_activity;
-- drop view if exists public.word_rating_stats;
-- drop table if exists public.word_rating_event;
-- commit;
