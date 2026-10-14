-- Preparation state of each video's chapter, kept step by step (phase 2A).
--
-- Why: prepareChapter held the transcription, the sentences and the
-- translations only in memory until the very end, so a failed translation
-- (e.g. the AI account out of credit) threw away a paid transcription, and
-- two triggers for the same video paid twice. Each step's result is now
-- stored here with its own cache key, and one run at a time holds a lease.
--
-- chapter_content stays the published version read by students. Rows here
-- are only written by the server (service role) through the functions below.
--
-- Cache keys (computed by the server, lib/chapterPrepKeys):
--   audio_key     video + language + transcription engine version.
--                 Importing lyrics does NOT change it: no new transcription.
--   segment_key   audio_key + imported lyrics + sentence splitter version.
--   translate_key segment_key + model + prompt + batch size.
-- `batches` holds finished translation batches by index; they survive any
-- error and are reused while translate_key is the same.
--
-- Leases: chapter_prep_claim hands out a lock_token valid for a lease. Every
-- write and the publication require that token AND an unexpired lease, so a
-- run whose lease ran out (and maybe was taken over) can no longer write.
--
-- Statuses: queued · transcribing · translating · publishing (in progress) ·
-- ready · failed · blocked (account problem: no credit / bad key) ·
-- pending_recovery (ran out of continuations; for automatic recovery later).

begin;

create table if not exists public.chapter_prep (
  video_id         text primary key,
  language         text not null,
  status           text not null default 'queued'
                   check (status in ('queued','transcribing','translating','publishing',
                                     'ready','failed','blocked','pending_recovery')),
  audio_key        text,
  transcript       jsonb,
  captions         jsonb,
  transcribed_at   timestamptz,
  segment_key      text,
  sentences        jsonb,
  translate_key    text,
  batch_size       int,
  batches          jsonb not null default '{}'::jsonb,
  published_key    text,
  attempts         int not null default 0,
  hops             int not null default 0,
  error_kind       text,
  last_error       text,
  recovery_reason  text,
  lock_token       uuid,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists chapter_prep_status_idx on public.chapter_prep (status) where status <> 'ready';

-- No policies: students and the anon key can neither read nor write the
-- table. The server uses the service role; the app reads only through
-- chapter_prep_status().
alter table public.chapter_prep enable row level security;
revoke all on public.chapter_prep from anon, authenticated;

-- Lease length, kept within sane bounds whatever the caller passes.
create or replace function public.chapter_prep_lease(p_seconds int)
returns interval language sql immutable as $$
  select make_interval(secs => least(greatest(coalesce(p_seconds, 180), 1), 900));
$$;

-- Take the video for one run. Atomic: of any number of simultaneous callers
-- exactly one gets a row back (with a fresh lock_token and the cached
-- results); the others get nothing while the lease is valid.
-- p_continuing: this run continues the previous one (counts a hop, not an attempt).
create or replace function public.chapter_prep_claim(p_video_id text, p_language text, p_lease_seconds int default 180, p_continuing boolean default false)
returns setof public.chapter_prep
language sql security definer set search_path = public as $$
  insert into public.chapter_prep as cp (video_id, language, status, attempts, hops, lock_token, locked_until)
  values (p_video_id, p_language, 'queued', 1, 0, gen_random_uuid(), now() + public.chapter_prep_lease(p_lease_seconds))
  on conflict (video_id) do update set
    language     = excluded.language,
    lock_token   = excluded.lock_token,
    locked_until = excluded.locked_until,
    attempts     = case when p_continuing then cp.attempts else cp.attempts + 1 end,
    hops         = case when p_continuing then cp.hops + 1 else 0 end,
    updated_at   = now()
  where cp.locked_until is null or cp.locked_until < now()
  returning cp.*;
$$;

-- Store a step's results and renew the lease. Only listed keys present in
-- p_patch are changed (a key with a JSON null clears that column). Returns
-- false when the token is not the current holder's or the lease ran out.
create or replace function public.chapter_prep_save(p_video_id text, p_token uuid, p_patch jsonb, p_lease_seconds int default 180)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_patch ? 'status' and p_patch->>'status' in ('ready') then
    raise exception 'chapter_prep_save: ready is set only by chapter_prep_publish';
  end if;
  update public.chapter_prep set
    status         = case when p_patch ? 'status'         then p_patch->>'status'                  else status end,
    audio_key      = case when p_patch ? 'audio_key'      then p_patch->>'audio_key'               else audio_key end,
    transcript     = case when p_patch ? 'transcript'     then nullif(p_patch->'transcript', 'null'::jsonb) else transcript end,
    captions       = case when p_patch ? 'captions'       then nullif(p_patch->'captions', 'null'::jsonb)   else captions end,
    transcribed_at = case when p_patch ? 'transcript'     then now()                               else transcribed_at end,
    segment_key    = case when p_patch ? 'segment_key'    then p_patch->>'segment_key'             else segment_key end,
    sentences      = case when p_patch ? 'sentences'      then nullif(p_patch->'sentences', 'null'::jsonb)  else sentences end,
    translate_key  = case when p_patch ? 'translate_key'  then p_patch->>'translate_key'           else translate_key end,
    batch_size     = case when p_patch ? 'batch_size'     then (p_patch->>'batch_size')::int       else batch_size end,
    batches        = case when p_patch ? 'batches'        then coalesce(nullif(p_patch->'batches', 'null'::jsonb), '{}'::jsonb) else batches end,
    error_kind     = case when p_patch ? 'error_kind'     then p_patch->>'error_kind'              else error_kind end,
    last_error     = case when p_patch ? 'last_error'     then p_patch->>'last_error'              else last_error end,
    locked_until   = now() + public.chapter_prep_lease(p_lease_seconds),
    updated_at     = now()
  where video_id = p_video_id and lock_token = p_token and locked_until > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Keep one finished translation batch (and renew the lease). Merged in one
-- statement, so batches finishing at the same time never overwrite each
-- other. Ignored (false) for a stale translate_key or a lost lease.
create or replace function public.chapter_prep_add_batch(p_video_id text, p_token uuid, p_translate_key text, p_index int, p_batch jsonb, p_lease_seconds int default 180)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.chapter_prep set
    batches      = batches || jsonb_build_object(p_index::text, p_batch),
    locked_until = now() + public.chapter_prep_lease(p_lease_seconds),
    updated_at   = now()
  where video_id = p_video_id and lock_token = p_token and locked_until > now()
    and translate_key is not distinct from p_translate_key;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Publish the chapter in chapter_content, in one transaction with the lease
-- check. Same rules as phase 1: only complete chapters (every sentence with
-- transliteration and English); without force an existing chapter is never
-- overwritten; with force it is replaced in a single statement, never deleted
-- first. Returns 'published' or 'kept_existing'; raises on a lost lease or an
-- incomplete chapter (and then changes nothing).
create or replace function public.chapter_prep_publish(p_video_id text, p_token uuid, p_sentences jsonb, p_source text, p_force boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  prep public.chapter_prep;
  missing int;
  n int;
begin
  select * into prep from public.chapter_prep
   where video_id = p_video_id and lock_token = p_token and locked_until > now()
   for update;
  if not found then
    raise exception 'chapter_prep_publish: lease lost for %', p_video_id using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_sentences) is distinct from 'array' or jsonb_array_length(p_sentences) = 0 then
    raise exception 'chapter_prep_publish: no sentences for %', p_video_id;
  end if;
  select count(*) into missing from jsonb_array_elements(p_sentences) s
   where btrim(coalesce(s->>'transliteration', '')) = '' or btrim(coalesce(s->>'english', '')) = '';
  if missing > 0 then
    raise exception 'chapter_prep_publish: % of % sentences untranslated', missing, jsonb_array_length(p_sentences);
  end if;

  if p_force then
    insert into public.chapter_content as cc (video_id, language, sentences, source, created_date)
    values (p_video_id, prep.language, p_sentences, p_source, now())
    on conflict (video_id) do update set
      language = excluded.language, sentences = excluded.sentences,
      source = excluded.source, created_date = excluded.created_date;
  else
    insert into public.chapter_content (video_id, language, sentences, source, created_date)
    values (p_video_id, prep.language, p_sentences, p_source, now())
    on conflict (video_id) do nothing;
  end if;
  get diagnostics n = row_count;

  update public.chapter_prep set
    status = 'ready', published_key = translate_key, error_kind = null, last_error = null,
    recovery_reason = null, lock_token = null, locked_until = null, updated_at = now()
  where video_id = p_video_id;
  return case when n = 1 then 'published' else 'kept_existing' end;
end $$;

-- End a run: record its final status and free the video. Only the holder of
-- the token can release it (a run whose lease expired may still release, as
-- long as nobody took the video over).
create or replace function public.chapter_prep_release(p_video_id text, p_token uuid, p_status text, p_error_kind text default null, p_last_error text default null, p_recovery_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_status not in ('queued','failed','blocked','pending_recovery') then
    raise exception 'chapter_prep_release: invalid final status %', p_status;
  end if;
  update public.chapter_prep set
    status = p_status, error_kind = p_error_kind, last_error = left(p_last_error, 2000),
    recovery_reason = p_recovery_reason, lock_token = null, locked_until = null, updated_at = now()
  where video_id = p_video_id and lock_token = p_token;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- What the app may know about a preparation: lets its fallback stay out of a
-- video the server is working on (or that is blocked / waiting for recovery).
-- Never exposes the cached content or the token.
create or replace function public.chapter_prep_status(p_video_id text)
returns table (status text, busy boolean, error_kind text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cp.status, (cp.locked_until is not null and cp.locked_until > now()), cp.error_kind, cp.updated_at
  from public.chapter_prep cp where cp.video_id = p_video_id;
$$;

revoke all on function public.chapter_prep_claim(text, text, int, boolean) from public, anon, authenticated;
revoke all on function public.chapter_prep_save(text, uuid, jsonb, int) from public, anon, authenticated;
revoke all on function public.chapter_prep_add_batch(text, uuid, text, int, jsonb, int) from public, anon, authenticated;
revoke all on function public.chapter_prep_publish(text, uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.chapter_prep_release(text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.chapter_prep_status(text) from public, anon;
grant execute on function public.chapter_prep_claim(text, text, int, boolean) to service_role;
grant execute on function public.chapter_prep_save(text, uuid, jsonb, int) to service_role;
grant execute on function public.chapter_prep_add_batch(text, uuid, text, int, jsonb, int) to service_role;
grant execute on function public.chapter_prep_publish(text, uuid, jsonb, text, boolean) to service_role;
grant execute on function public.chapter_prep_release(text, uuid, text, text, text, text) to service_role;
grant execute on function public.chapter_prep_status(text) to authenticated, service_role;

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to remove; chapter_content is not touched):
-- ----------------------------------------------------------------------------
-- begin;
-- drop function if exists public.chapter_prep_status(text);
-- drop function if exists public.chapter_prep_release(text, uuid, text, text, text, text);
-- drop function if exists public.chapter_prep_publish(text, uuid, jsonb, text, boolean);
-- drop function if exists public.chapter_prep_add_batch(text, uuid, text, int, jsonb, int);
-- drop function if exists public.chapter_prep_save(text, uuid, jsonb, int);
-- drop function if exists public.chapter_prep_claim(text, text, int, boolean);
-- drop function if exists public.chapter_prep_lease(int);
-- drop table if exists public.chapter_prep;
-- commit;
