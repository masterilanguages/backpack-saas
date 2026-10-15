-- Published chapters must carry word glosses too (phase 2A, adjustment C).
--
-- Why: "Ready to learn" has to mean everything is there. chapter_prep_publish
-- (2100) checked every sentence's transliteration and English, not its word
-- glosses; a chapter without them would publish, and the app would then ask
-- the AI for each word's meaning when a student taps it. prepareChapter
-- checks this before publishing (lib/chapterPublish incompleteCount); this
-- is the same rule in SQL, so nothing incomplete can be published.
--
-- The rule: a sentence with something to gloss needs at least one gloss.
-- A sentence made only of digits, spaces and ASCII punctuation ("24", "...")
-- is exempt. Glosses aren't required to have every field (a name may lack a
-- meaning). Checked on 2026-10-14: all 10 published chapters (335 sentences,
-- 3,451 glosses) already meet it; nothing published is touched anyway.
--
-- Only chapter_prep_publish changes (same signature, owner and grants).

begin;

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
   where btrim(coalesce(s->>'transliteration', '')) = '' or btrim(coalesce(s->>'english', '')) = ''
      -- 2121: a sentence with something to gloss needs at least one word gloss
      or (coalesce(s->>'text', s->>'hebrew', '') !~ '^[[:space:]0-9!-/:-@[-`{-~]*$'
          and (jsonb_typeof(s->'words') is distinct from 'array' or jsonb_array_length(s->'words') = 0));
  if missing > 0 then
    raise exception 'chapter_prep_publish: % of % sentences without transliteration, English or glosses', missing, jsonb_array_length(p_sentences);
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

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (uncomment to restore the 2100 function exactly):
-- ----------------------------------------------------------------------------
-- begin;
-- create or replace function public.chapter_prep_publish(p_video_id text, p_token uuid, p_sentences jsonb, p_source text, p_force boolean default false)
-- returns text
-- language plpgsql security definer set search_path = public as $$
-- declare
--   prep public.chapter_prep;
--   missing int;
--   n int;
-- begin
--   select * into prep from public.chapter_prep
--    where video_id = p_video_id and lock_token = p_token and locked_until > now()
--    for update;
--   if not found then
--     raise exception 'chapter_prep_publish: lease lost for %', p_video_id using errcode = 'P0001';
--   end if;
--   if jsonb_typeof(p_sentences) is distinct from 'array' or jsonb_array_length(p_sentences) = 0 then
--     raise exception 'chapter_prep_publish: no sentences for %', p_video_id;
--   end if;
--   select count(*) into missing from jsonb_array_elements(p_sentences) s
--    where btrim(coalesce(s->>'transliteration', '')) = '' or btrim(coalesce(s->>'english', '')) = '';
--   if missing > 0 then
--     raise exception 'chapter_prep_publish: % of % sentences untranslated', missing, jsonb_array_length(p_sentences);
--   end if;
--
--   if p_force then
--     insert into public.chapter_content as cc (video_id, language, sentences, source, created_date)
--     values (p_video_id, prep.language, p_sentences, p_source, now())
--     on conflict (video_id) do update set
--       language = excluded.language, sentences = excluded.sentences,
--       source = excluded.source, created_date = excluded.created_date;
--   else
--     insert into public.chapter_content (video_id, language, sentences, source, created_date)
--     values (p_video_id, prep.language, p_sentences, p_source, now())
--     on conflict (video_id) do nothing;
--   end if;
--   get diagnostics n = row_count;
--
--   update public.chapter_prep set
--     status = 'ready', published_key = translate_key, error_kind = null, last_error = null,
--     recovery_reason = null, lock_token = null, locked_until = null, updated_at = now()
--   where video_id = p_video_id;
--   return case when n = 1 then 'published' else 'kept_existing' end;
-- end $$;
-- commit;
