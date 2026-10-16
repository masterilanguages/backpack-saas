-- Undoes migration 2200 without losing what was saved under it.
--
-- MANUAL ONLY. This file is outside supabase/migrations on purpose: neither
-- `supabase db push` nor any script applies it. Run it by hand, after review.
--
-- First the code must stop using it (NEXT_PUBLIC_VERB_FORMS_LANGS empty, or
-- the previous deployment), then run this. Verb cards stay as cards (their
-- word is the infinitive); the forms and the conjugation tables are copied to
-- archive tables first, so they can be restored. Safe to run twice.

begin;

create table if not exists public.word_verb_forms_archive_2200 (
  word_id     text,
  created_by  text,
  word        text,
  phonetic    text,
  translation text,
  language    text,
  lemma_key   text,
  verb_forms  jsonb,
  archived_at timestamptz not null default now()
);
create table if not exists public.verb_lexicon_archive_2200 (
  row         jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.word_verb_forms_archive_2200 enable row level security;
alter table public.verb_lexicon_archive_2200 enable row level security;
revoke all on public.word_verb_forms_archive_2200 from anon, authenticated;
revoke all on public.verb_lexicon_archive_2200 from anon, authenticated;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'word' and column_name = 'lemma_key') then
    insert into public.word_verb_forms_archive_2200 (word_id, created_by, word, phonetic, translation, language, lemma_key, verb_forms)
    select id, created_by, word, phonetic, translation, language::text, lemma_key, verb_forms
    from public.word where lemma_key is not null or verb_forms is not null;
  end if;
  if to_regclass('public.verb_lexicon') is not null then
    insert into public.verb_lexicon_archive_2200 (row) select to_jsonb(v) from public.verb_lexicon v;
  end if;
end
$$;

drop function if exists public.save_verb_occurrence(jsonb, jsonb);
drop function if exists public.claim_verb_checks(text[], int, int);
drop function if exists public.resolve_verb_check(text, jsonb, jsonb);
drop function if exists public.verb_forms_add(jsonb, jsonb);
drop function if exists public.verb_occurrence_json(jsonb);
drop function if exists public.verb_lexicon_claim(text, text, text, int, int, text, int);
drop function if exists public.verb_lexicon_save(text, text, uuid, jsonb);
drop function if exists public.verb_lexicon_fail(text, text, uuid, text, boolean);
drop function if exists public.verb_surface_key(text);
drop table if exists public.verb_lexicon;
drop index if exists public.word_user_lemma_uq;
drop index if exists public.word_verb_check_idx;
-- Words still waiting for a check simply stay as they were saved.
alter table public.word
  drop column if exists verb_forms, drop column if exists lemma_key,
  drop column if exists verb_check, drop column if exists verb_check_at, drop column if exists verb_check_attempts;

commit;
