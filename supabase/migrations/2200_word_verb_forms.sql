-- Verbs in the Backpack ("Verbos en Flashcards"), phase 1: storage only.
--
-- A conjugated verb saved from a video becomes ONE card per infinitive and
-- student: word/phonetic/translation hold the infinitive, and verb_forms
-- keeps every form the student met (exact word, grammar, sentence, video).
-- Other words are untouched: lemma_key and verb_forms stay null.
--
--   word.lemma_key   infinitive without nikud + binyan (lib/verbs lemmaKey).
--   word.verb_forms  [{ surface, prefix, form, phonetic, translation, tense,
--                       person, gender, number, sentence, video_id,
--                       video_title, added_at }]
--   word_user_lemma_uq  one card per (student, language, infinitive). Partial:
--                    rows without lemma_key (every existing row) are exempt.
--
-- save_verb_occurrence (the app, as the student): creates the card or adds
-- the form to it in ONE statement (insert … on conflict do update), so two
-- saves at once never make two cards. created_by is always the caller's
-- email (set_system_fields would accept one sent by the client).
--
-- Words saved without waiting for an analysis (a lesson's recommended words,
-- typed words, an analysis that timed out) are saved at once as before with
-- verb_check = 'pending', and analyzed later (lib/verbChecks): closing the
-- tab loses nothing, the next visit picks them up.
--   claim_verb_checks   hands the student's pending words to ONE caller
--                       (for update skip locked: two tabs never pay twice),
--                       at most p_max_attempts times per word.
--   resolve_verb_check  turns a checked word into its infinitive's card, or
--                       adds it as a form to the card the student already
--                       has (a still-untouched new row is then removed; one
--                       with progress is kept as it is), or marks it done.
--
-- verb_lexicon: one conjugation table per verb, shared by everyone and made
-- once by the verbConjugations edge function. Written only by the server
-- (service role) through claim/save/fail with a lease, as chapter_prep (2100):
-- of two simultaneous requests for a new verb only one gets the lock_token
-- and calls the model; a failed verb is retried at most p_max_attempts times
-- in total. A student may start at most p_daily_new_limit NEW verbs a day
-- (requested_by), so made-up verbs can't run up the AI bill. Students may
-- read the finished tables (not the lock or requester columns).
--
-- Only adds: no existing column, default, policy or function changes, so the
-- current app works the same with it applied. Rollback:
-- supabase/rollback/2200_word_verb_forms_down.sql (archives, then drops).

begin;

alter table public.word
  add column if not exists lemma_key  text,
  add column if not exists verb_forms jsonb,
  add column if not exists verb_check text check (verb_check in ('pending', 'checking', 'done')),
  add column if not exists verb_check_at timestamptz,
  add column if not exists verb_check_attempts smallint;

create index if not exists word_verb_check_idx
  on public.word (created_by, verb_check)
  where verb_check in ('pending', 'checking');

create unique index if not exists word_user_lemma_uq
  on public.word (created_by, language, lemma_key)
  where lemma_key is not null;

-- Spelling used to tell two forms apart: no nikud, no punctuation, lower case
-- (same rule as lib/verbs plainSpelling).
create or replace function public.verb_surface_key(p text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(regexp_replace(coalesce(p, ''), '[֑-ׇ]', '', 'g'),
                              '[\s.,!?;:"''()\[\]{}״׳…–—-]', '', 'g'));
$$;

-- One form as stored in verb_forms: only known fields, each bounded; the
-- time is the server's.
create or replace function public.verb_occurrence_json(p_occurrence jsonb)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'surface',     btrim(coalesce(p_occurrence->>'surface', '')),
    'prefix',      nullif(left(p_occurrence->>'prefix', 6), ''),
    'form',        nullif(left(p_occurrence->>'form', 60), ''),
    'phonetic',    nullif(left(p_occurrence->>'phonetic', 60), ''),
    'translation', nullif(left(p_occurrence->>'translation', 120), ''),
    'tense',       case when p_occurrence->>'tense' in ('past', 'present', 'future', 'imperative', 'infinitive') then p_occurrence->>'tense' end,
    'person',      case when p_occurrence->>'person' in ('1', '2', '3') then (p_occurrence->>'person')::int end,
    'gender',      case when p_occurrence->>'gender' in ('m', 'f') then p_occurrence->>'gender' end,
    'number',      case when p_occurrence->>'number' in ('sg', 'pl') then p_occurrence->>'number' end,
    'sentence',    nullif(left(p_occurrence->>'sentence', 500), ''),
    'video_id',    nullif(left(p_occurrence->>'video_id', 40), ''),
    'video_title', nullif(left(p_occurrence->>'video_title', 200), ''),
    'added_at',    now()
  ));
$$;

-- verb_forms plus one form, unless the same word from the same video is
-- already there (or the card holds 50 forms).
create or replace function public.verb_forms_add(p_forms jsonb, p_occ jsonb)
returns jsonb language sql stable set search_path = public as $$
  select case
    when exists (
      select 1 from jsonb_array_elements(coalesce(p_forms, '[]'::jsonb)) e
      where public.verb_surface_key(e->>'surface') = public.verb_surface_key(p_occ->>'surface')
        and coalesce(e->>'video_id', '') = coalesce(p_occ->>'video_id', ''))
      or jsonb_array_length(coalesce(p_forms, '[]'::jsonb)) >= 50
    then p_forms
    else coalesce(p_forms, '[]'::jsonb) || jsonb_build_array(p_occ)
  end;
$$;

create or replace function public.save_verb_occurrence(p_word jsonb, p_occurrence jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_email   text := public.app_email();
  v_key     text := btrim(coalesce(p_word->>'lemma_key', ''));
  v_lemma   text := btrim(coalesce(p_word->>'word', ''));
  v_surface text := btrim(coalesce(p_occurrence->>'surface', ''));
  v_lang    public.app_language;
  v_occ     jsonb;
  v_row     jsonb;
  v_created boolean;
begin
  if coalesce(v_email, '') = '' then
    raise exception 'save_verb_occurrence: not signed in' using errcode = '42501';
  end if;
  if v_lemma = '' or v_surface = '' or v_key = ''
     or length(v_lemma) > 60 or length(v_surface) > 60 or length(v_key) > 80
     or v_key ~ '[֑-ׇ]' then
    raise exception 'save_verb_occurrence: invalid word' using errcode = '22023';
  end if;
  v_lang := coalesce(nullif(p_word->>'language', ''), 'hebrew')::public.app_language;

  v_occ := public.verb_occurrence_json(p_occurrence);

  insert into public.word as w (
    word, phonetic, translation, category, language, lemma_key, verb_forms, is_verb,
    example_sentence, source_video_id, source_video_title, learn_status,
    times_practiced, mastered, image_url, mnemonic_explanation, created_by
  ) values (
    v_lemma,
    nullif(left(p_word->>'phonetic', 60), ''),
    coalesce(left(p_word->>'translation', 120), ''),
    coalesce(nullif(left(p_word->>'category', 40), ''), 'wordbank'),
    v_lang, v_key, jsonb_build_array(v_occ), true,
    v_occ->>'sentence', v_occ->>'video_id', v_occ->>'video_title',
    case when p_word->>'learn_status' in ('new', 'learning', 'skipped') then p_word->>'learn_status' end,
    case when p_word->>'times_practiced' ~ '^[0-5]$' then (p_word->>'times_practiced')::int else 0 end,
    coalesce(p_word->>'mastered' = 'true', false),
    nullif(left(p_word->>'image_url', 1000), ''),
    nullif(left(p_word->>'mnemonic_explanation', 2000), ''),
    v_email
  )
  on conflict (created_by, language, lemma_key) where lemma_key is not null
  do update set
    -- The card keeps its progress, image, status, sentence and video; only a
    -- form not seen before (same word in the same video) is added.
    verb_forms = public.verb_forms_add(w.verb_forms, v_occ),
    is_verb = true
  returning to_jsonb(w.*), (w.xmax = 0) into v_row, v_created;

  return jsonb_build_object('word', v_row, 'created', v_created);
end
$$;

-- The caller's pending words (all, or only p_ids), now 'checking' for them.
-- A 'checking' word whose caller vanished (3 min) can be claimed again; a
-- word claimed p_max_attempts times is given up ('done', left as it is).
create or replace function public.claim_verb_checks(p_ids text[] default null, p_limit int default 20, p_max_attempts int default 2)
returns setof public.word
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_email text := public.app_email();
begin
  if coalesce(v_email, '') = '' then
    raise exception 'claim_verb_checks: not signed in' using errcode = '42501';
  end if;
  update public.word set verb_check = 'done'
  where created_by = v_email and verb_check in ('pending', 'checking')
    and coalesce(verb_check_attempts, 0) >= greatest(coalesce(p_max_attempts, 2), 1)
    and (verb_check = 'pending' or verb_check_at < now() - interval '3 minutes');
  return query
  update public.word w set
    verb_check = 'checking', verb_check_at = now(), verb_check_attempts = coalesce(w.verb_check_attempts, 0) + 1
  where w.id in (
    select x.id from public.word x
    where x.created_by = v_email
      and (p_ids is null or x.id = any (p_ids))
      and (x.verb_check = 'pending' or (x.verb_check = 'checking' and x.verb_check_at < now() - interval '3 minutes'))
    order by x.created_date
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked)
  returning w.*;
end
$$;

-- The result of checking one claimed word. p_word null = not a verb.
create or replace function public.resolve_verb_check(p_word_id text, p_word jsonb, p_occurrence jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_email text := public.app_email();
  v_row   public.word;
  v_card  public.word;
  v_key   text := btrim(coalesce(p_word->>'lemma_key', ''));
  v_lemma text := btrim(coalesce(p_word->>'word', ''));
  v_occ   jsonb;
  v_out   jsonb;
begin
  if coalesce(v_email, '') = '' then
    raise exception 'resolve_verb_check: not signed in' using errcode = '42501';
  end if;
  select * into v_row from public.word where id = p_word_id and created_by = v_email for update;
  if not found then
    return jsonb_build_object('action', 'missing');
  end if;
  if v_row.verb_check is distinct from 'checking' then
    return jsonb_build_object('action', 'skipped', 'word', to_jsonb(v_row));
  end if;

  if p_word is null then
    update public.word set verb_check = 'done' where id = p_word_id returning to_jsonb(word.*) into v_out;
    return jsonb_build_object('action', 'not-verb', 'word', v_out);
  end if;

  if v_lemma = '' or v_key = '' or length(v_lemma) > 60 or length(v_key) > 80 or v_key ~ '[\u0591-\u05C7]' then
    raise exception 'resolve_verb_check: invalid word' using errcode = '22023';
  end if;
  v_occ := public.verb_occurrence_json(p_occurrence);
  if coalesce(v_occ->>'surface', '') = '' then
    raise exception 'resolve_verb_check: invalid word' using errcode = '22023';
  end if;

  -- The student already has this infinitive's card: add the form there.
  select * into v_card from public.word
  where created_by = v_email and language = v_row.language and lemma_key = v_key and id <> p_word_id
  for update;
  if found then
    update public.word set verb_forms = public.verb_forms_add(verb_forms, v_occ), is_verb = true
    where id = v_card.id returning to_jsonb(word.*) into v_out;
    if coalesce(v_row.times_practiced, 0) = 0 and v_row.image_url is null and v_row.mnemonic_explanation is null
       and coalesce(v_row.learn_status, 'new') = 'new' and not coalesce(v_row.approved, false) then
      delete from public.word where id = p_word_id;
      return jsonb_build_object('action', 'merged', 'word', v_out, 'removed', p_word_id);
    end if;
    -- It already has progress of its own: kept as it is.
    update public.word set verb_check = 'done' where id = p_word_id;
    return jsonb_build_object('action', 'merged-kept', 'word', v_out);
  end if;

  -- Otherwise this row becomes the infinitive's card (progress kept).
  update public.word set
    word = v_lemma,
    phonetic = coalesce(nullif(left(p_word->>'phonetic', 60), ''), phonetic),
    translation = coalesce(nullif(left(p_word->>'translation', 120), ''), translation),
    lemma_key = v_key,
    verb_forms = jsonb_build_array(v_occ),
    is_verb = true,
    verb_check = 'done'
  where id = p_word_id
  returning to_jsonb(word.*) into v_out;
  return jsonb_build_object('action', 'converted', 'word', v_out);
end
$$;

create table if not exists public.verb_lexicon (
  language        text not null,
  lemma_key       text not null,
  lemma           text,
  lemma_phonetic  text,
  lemma_meaning   text,
  binyan          text,
  root            text,
  conjugations    jsonb,
  model           text,
  prompt_version  text,
  status          text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  attempts        int not null default 0,
  lock_token      uuid,
  locked_until    timestamptz,
  last_error      text,
  requested_by    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (language, lemma_key)
);

create index if not exists verb_lexicon_requested_idx on public.verb_lexicon (requested_by, created_at);

alter table public.verb_lexicon enable row level security;
revoke all on public.verb_lexicon from anon, authenticated;
drop policy if exists verb_lexicon_read on public.verb_lexicon;
create policy verb_lexicon_read on public.verb_lexicon for select to authenticated using (true);
-- Not the lock columns.
grant select (language, lemma_key, lemma, lemma_phonetic, lemma_meaning, binyan, root, conjugations, status, updated_at)
  on public.verb_lexicon to authenticated;

-- Hands the verb to one caller: a new verb, or one whose lease ran out, with
-- no table yet and fewer than p_max_attempts tries. Nothing comes back when
-- someone else holds it, it is done, or it failed too often. A NEW verb
-- beyond p_requested_by's daily limit raises 'daily limit'.
-- The default lease (400 s) outlasts an edge function run, so a slow answer
-- is never paid for twice.
create or replace function public.verb_lexicon_claim(
  p_language text, p_lemma_key text, p_lemma text,
  p_lease_seconds int default 400, p_max_attempts int default 2,
  p_requested_by text default null, p_daily_new_limit int default null)
returns setof public.verb_lexicon
language plpgsql security definer set search_path = public as $$
begin
  if p_requested_by is not null and p_daily_new_limit is not null
     and not exists (select 1 from public.verb_lexicon x where x.language = p_language and x.lemma_key = p_lemma_key)
     and (select count(*) from public.verb_lexicon x
          where x.requested_by = p_requested_by and x.created_at > now() - interval '1 day') >= p_daily_new_limit then
    raise exception 'verb_lexicon_claim: daily limit of new verbs reached' using errcode = 'P0001';
  end if;
  return query
  insert into public.verb_lexicon as v (language, lemma_key, lemma, status, attempts, lock_token, locked_until, requested_by)
  values (p_language, p_lemma_key, p_lemma, 'pending', 1, gen_random_uuid(),
          now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 400), 1), 600)), p_requested_by)
  on conflict (language, lemma_key) do update set
    lock_token   = excluded.lock_token,
    locked_until = excluded.locked_until,
    attempts     = v.attempts + 1,
    status       = 'pending',
    updated_at   = now()
  where v.conjugations is null
    and (v.locked_until is null or v.locked_until < now())
    and v.attempts < greatest(coalesce(p_max_attempts, 2), 1)
  returning v.*;
end
$$;

-- Stores the table; only with the caller's token and an unexpired lease.
create or replace function public.verb_lexicon_save(p_language text, p_lemma_key text, p_token uuid, p_patch jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p_patch->'conjugations') is distinct from 'object' or p_patch->'conjugations' = '{}'::jsonb then
    raise exception 'verb_lexicon_save: a conjugation table is required' using errcode = '22023';
  end if;
  update public.verb_lexicon set
    lemma          = coalesce(nullif(p_patch->>'lemma', ''), lemma),
    lemma_phonetic = nullif(p_patch->>'lemma_phonetic', ''),
    lemma_meaning  = nullif(p_patch->>'lemma_meaning', ''),
    binyan         = nullif(p_patch->>'binyan', ''),
    root           = nullif(p_patch->>'root', ''),
    conjugations   = p_patch->'conjugations',
    model          = nullif(p_patch->>'model', ''),
    prompt_version = nullif(p_patch->>'prompt_version', ''),
    status         = 'ready',
    last_error     = null,
    lock_token     = null,
    locked_until   = null,
    updated_at     = now()
  where language = p_language and lemma_key = p_lemma_key
    and lock_token = p_token and locked_until > now()
    and conjugations is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- Gives the verb back after a failed call. It counts as an attempt, unless
-- p_refund (the AI account failed — no credit, bad key — not this verb).
create or replace function public.verb_lexicon_fail(p_language text, p_lemma_key text, p_token uuid, p_error text, p_refund boolean default false)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.verb_lexicon set
    status = 'failed', last_error = left(p_error, 500),
    attempts = case when p_refund then greatest(attempts - 1, 0) else attempts end,
    lock_token = null, locked_until = null, updated_at = now()
  where language = p_language and lemma_key = p_lemma_key
    and lock_token = p_token and conjugations is null;
  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- New functions are granted to anon/authenticated by default in this project.
revoke all on function public.save_verb_occurrence(jsonb, jsonb) from public, anon;
grant execute on function public.save_verb_occurrence(jsonb, jsonb) to authenticated;
revoke all on function public.verb_surface_key(text) from public, anon;
grant execute on function public.verb_surface_key(text) to authenticated, service_role;
revoke all on function public.verb_occurrence_json(jsonb) from public, anon;
grant execute on function public.verb_occurrence_json(jsonb) to authenticated, service_role;
revoke all on function public.verb_forms_add(jsonb, jsonb) from public, anon;
grant execute on function public.verb_forms_add(jsonb, jsonb) to authenticated, service_role;
revoke all on function public.claim_verb_checks(text[], int, int) from public, anon;
grant execute on function public.claim_verb_checks(text[], int, int) to authenticated;
revoke all on function public.resolve_verb_check(text, jsonb, jsonb) from public, anon;
grant execute on function public.resolve_verb_check(text, jsonb, jsonb) to authenticated;
revoke all on function public.verb_lexicon_claim(text, text, text, int, int, text, int) from public, anon, authenticated;
revoke all on function public.verb_lexicon_save(text, text, uuid, jsonb)     from public, anon, authenticated;
revoke all on function public.verb_lexicon_fail(text, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.verb_lexicon_claim(text, text, text, int, int, text, int) to service_role;
grant execute on function public.verb_lexicon_save(text, text, uuid, jsonb)     to service_role;
grant execute on function public.verb_lexicon_fail(text, text, uuid, text, boolean) to service_role;

commit;
