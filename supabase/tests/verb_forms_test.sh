#!/usr/bin/env bash
# Tests migration 2200 (verb cards + verb_lexicon) against a throwaway local
# PostgreSQL 17 in Docker. Never touches Supabase.
#
#   bash supabase/tests/verb_forms_test.sh
#
# public.word is rebuilt as in production (columns, triggers and RLS policies
# copied from the live database on 2026-10-16), with auth.jwt() read from
# request.jwt.claims. Then: 2200 applies (twice), one card per infinitive under
# concurrency, security, the shared lexicon's leases, the rollback, and finally
# the verbConjugations tests against these SQL functions (fake model).
set -u
cd "$(dirname "$0")/../.."
NAME=verb-forms-test
PORT=55433
PASS=0; FAIL=0
TMP=$(mktemp -d)

docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=x -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null || exit 1
trap 'docker rm -f $NAME >/dev/null 2>&1; rm -rf "$TMP"' EXIT
for _ in $(seq 1 60); do docker exec $NAME pg_isready -U postgres -q && break; sleep 1; done
sleep 2

qs() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 2>&1; }   # SQL from stdin
# SQL from stdin as a signed-in student ($1 = email; "" = signed in without email; "anon" = anon role).
as() {
  local role=authenticated claims="{\"email\":\"$1\"}"
  [ "$1" = "anon" ] && { role=anon; claims="{}"; }
  [ -z "$1" ] && claims="{}"
  { printf "set role %s;\nselect set_config('request.jwt.claims', '%s', false) as _ \\\\gset\n" "$role" "$claims"; cat; } | qs
}
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected: $2"; echo "       actual:   $3"; fi
}
contains() { # name needle haystack
  case "$3" in *"$2"*) PASS=$((PASS+1)); echo "  ok   $1";; *) FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected to contain: $2"; echo "       actual: $3";; esac
}
# save_verb_occurrence as $1 for lemma key $2 / surface $3 / video $4 → "created|forms"
save() {
  as "$1" <<SQL
select (r->>'created') || '|' || jsonb_array_length(r->'word'->'verb_forms')
from save_verb_occurrence(
  '{"word":"לְהַנִּיחַ","phonetic":"lehaniach","translation":"to put","language":"hebrew","lemma_key":"$2","category":"wordbank","learn_status":"new"}',
  '{"surface":"$3","tense":"past","person":2,"gender":"m","number":"sg","sentence":"sentence of $4","video_id":"$4","video_title":"Song $4"}') r;
SQL
}

echo "== setup: production-like word table"
qs >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Same default privileges as production (pg_default_acl, checked 2026-10-14).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
create function public.app_email() returns text language sql stable as $$ select auth.jwt()->>'email' $$;
create function public.app_role() returns text language sql stable as $$ select coalesce(auth.jwt()->'app_metadata'->>'user_role', 'user') $$;
create function public.is_platform_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
create function public.my_org_ids() returns setof uuid language sql stable as $$ select null::uuid where false $$;
create function public.my_org_id() returns uuid language sql stable as $$ select null::uuid $$;
create function public.has_org_role(uuid, text) returns boolean language sql stable as $$ select false $$;
create function public.coach_of_email(text) returns boolean language sql stable as $$ select false $$;

create type public.app_language as enum ('hebrew', 'english', 'spanish', 'french', 'portuguese', 'italian');
create type public.difficulty as enum ('beginner', 'intermediate', 'advanced');
create table public.word (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  created_date timestamptz not null default now(), updated_date timestamptz not null default now(),
  created_by text, word text not null, translation text, phonetic text, audio_url text, image_url text,
  mnemonic_explanation text, youtube_url text, exercises jsonb default '[]'::jsonb, category text,
  difficulty public.difficulty default 'beginner', example_sentence text, saved_sentences jsonb default '[]'::jsonb,
  times_practiced int default 0, mastered boolean default false, vocab_level smallint default 0,
  language public.app_language default 'hebrew', day_introduced int, is_top_500 boolean default false,
  is_starred boolean default false, is_verb boolean default false, approved boolean default false,
  approved_by text, approved_at timestamptz, assigned_by_coach text, coach_folder text,
  verb_conjugations jsonb default '{}'::jsonb, org_id uuid, review_status text, source_video_id text,
  source_video_title text, usage_examples jsonb, learn_status text check (learn_status in ('new', 'learning', 'skipped')),
  priority smallint, learn_decided_at timestamptz
);
create index word_source_video_idx on public.word (created_by, source_video_id);

create function public.set_system_fields() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if (new.id is null or new.id = '') then new.id := replace(gen_random_uuid()::text, '-', ''); end if;
    new.created_date := coalesce(new.created_date, now());
    new.created_by   := coalesce(new.created_by, app_email());
  end if;
  new.updated_date := now();
  return new;
end $$;
create function public.stamp_org_id() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin if new.org_id is null then new.org_id := public.my_org_id(); end if; return new; end $$;
create function public.freeze_org_id() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if old.org_id is not null and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create table public.word_rating_event (
  id bigint generated always as identity primary key, word_id text references public.word(id) on delete set null,
  org_id uuid, created_by text, rating smallint not null, previous_rating smallint, created_at timestamptz not null default now()
);
create function public.log_word_rating() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.times_practiced, 0) = 0 then return new; end if;
  elsif new.times_practiced is not distinct from old.times_practiced then
    return new;
  end if;
  insert into public.word_rating_event (word_id, org_id, created_by, rating, previous_rating)
  values (new.id, new.org_id, new.created_by, coalesce(new.times_practiced, 0), case when tg_op = 'UPDATE' then old.times_practiced end);
  return new;
end $$;
create trigger trg_freeze_org_id before update on public.word for each row execute function freeze_org_id();
create trigger trg_log_word_rating after insert or update of times_practiced on public.word for each row execute function log_word_rating();
create trigger trg_stamp_org_id before insert on public.word for each row execute function stamp_org_id();
create trigger word_sys before insert or update on public.word for each row execute function set_system_fields();

alter table public.word enable row level security;
create policy word_org_select on public.word for select using (
  ((org_id is null) or (org_id in (select my_org_ids())) or is_platform_admin())
  and ((app_role() = 'admin') or has_org_role(org_id, 'admin') or is_platform_admin() or (created_by = app_email()) or coach_of_email(created_by) or (approved = true)));
create policy word_org_write on public.word for all using (
  ((org_id is null) or (org_id in (select my_org_ids())) or is_platform_admin())
  and ((app_role() = 'admin') or has_org_role(org_id, 'admin') or is_platform_admin() or (created_by = app_email()) or coach_of_email(created_by) or (approved = true)))
  with check (
  ((org_id is null) or (org_id in (select my_org_ids())) or is_platform_admin())
  and ((app_role() = 'admin') or has_org_role(org_id, 'admin') or is_platform_admin() or (created_by = app_email()) or coach_of_email(created_by) or (approved = true)));

-- Existing data: a card, and a duplicate pair (production has 6 such groups).
insert into public.word (word, created_by, translation, created_date) values
  ('נשמה', 'a@x.com', 'soul', now() - interval '1 day'), ('ספר', 'a@x.com', 'book', now() - interval '1 day'), ('ספר', 'a@x.com', 'book', now() - interval '1 day');
SQL
check "production-like word table built" "3" "$(echo "select count(*) from word" | qs)"

echo "== 1. migration 2200"
out=$(qs < supabase/migrations/2200_word_verb_forms.sql); check "2200 applies over existing rows (incl. duplicates)" "" "$out"
out=$(qs < supabase/migrations/2200_word_verb_forms.sql); check "2200 applies twice (idempotent)" "" "$out"
check "existing rows untouched: no lemma_key, no verb_forms" "3|0|0" "$(echo "select count(*)||'|'||count(lemma_key)||'|'||count(verb_forms) from word" | qs)"

echo "== 2. other words are saved exactly as before"
as a@x.com >/dev/null <<'SQL'
insert into word (word, translation, language, category) values ('נשמה', 'soul', 'hebrew', 'wordbank');
insert into word (word, translation, language, category) values ('נשמה', 'soul', 'hebrew', 'wordbank');
SQL
check "a noun can still be saved twice (no new constraint on plain words)" "3" "$(echo "select count(*) from word where word='נשמה'" | qs)"
check "the student's plain rows get created_by from the session as before" "2" "$(echo "select count(*) from word where word='נשמה' and created_by='a@x.com' and created_date > now() - interval '1 minute'" | qs)"

echo "== 3. one card per infinitive"
check "first form creates the card"                    "true|1"  "$(save a@x.com 'להניח|hifil' 'שהנחת' vid-1)"
check "the same form from the same video again: no duplicate" "false|1" "$(save a@x.com 'להניח|hifil' 'שהנחת' vid-1)"
check "same form with nikud: still the same form"      "false|1" "$(save a@x.com 'להניח|hifil' 'שֶׁהֵנַחְתָּ' vid-1)"
check "the same form in another song is a new occurrence" "false|2" "$(save a@x.com 'להניח|hifil' 'שהנחת' vid-2)"
check "another form of the verb joins the card"        "false|3" "$(save a@x.com 'להניח|hifil' 'הנחתי' vid-2)"
row=$(echo "select word||'|'||phonetic||'|'||translation||'|'||is_verb||'|'||created_by||'|'||example_sentence||'|'||source_video_id||'|'||learn_status from word where lemma_key='להניח|hifil'" | qs)
check "the card shows the infinitive and keeps the first sentence and video" "לְהַנִּיחַ|lehaniach|to put|true|a@x.com|sentence of vid-1|vid-1|new" "$row"
check "each form keeps its word, grammar, sentence and video" "שהנחת|past|2|m|sg|sentence of vid-1|vid-1|Song vid-1" \
  "$(echo "select f->>'surface'||'|'||(f->>'tense')||'|'||(f->>'person')||'|'||(f->>'gender')||'|'||(f->>'number')||'|'||(f->>'sentence')||'|'||(f->>'video_id')||'|'||(f->>'video_title') from word, jsonb_array_elements(verb_forms) with ordinality as e(f, n) where lemma_key='להניח|hifil' and n = 1" | qs)"
contains "added_at is set by the server" "20" "$(echo "select verb_forms->0->>'added_at' from word where lemma_key='להניח|hifil'" | qs)"

echo "== 4. joining a card never touches its progress"
as a@x.com >/dev/null <<'SQL'
update word set times_practiced = 3, learn_status = 'learning', image_url = 'img.png' where lemma_key = 'להניח|hifil';
SQL
save a@x.com 'להניח|hifil' 'תניח' vid-3 >/dev/null
check "rating, status and image kept after a new form" "3|learning|img.png|4" \
  "$(echo "select times_practiced||'|'||learn_status||'|'||image_url||'|'||jsonb_array_length(verb_forms) from word where lemma_key='להניח|hifil'" | qs)"
check "the rating history still works on verb cards" "1" "$(echo "select count(*) from word_rating_event e join word w on w.id = e.word_id where w.lemma_key='להניח|hifil'" | qs)"

echo "== 5. security"
check "another student's same verb is their own card" "true|1" "$(save b@x.com 'להניח|hifil' 'הניחו' vid-9)"
check "…and the first student's card did not change" "4" "$(echo "select jsonb_array_length(verb_forms) from word where lemma_key='להניח|hifil' and created_by='a@x.com'" | qs)"
out=$(as a@x.com <<'SQL'
select (r->'word'->>'created_by') from save_verb_occurrence(
  '{"word":"לֶאֱכֹל","language":"hebrew","lemma_key":"לאכול|paal","created_by":"victim@x.com","org_id":"00000000-0000-0000-0000-000000000001"}',
  '{"surface":"אכלתי"}') r;
SQL
)
check "a created_by sent by the client is ignored" "a@x.com" "$out"
check "…and so is an org_id" "" "$(echo "select coalesce(org_id::text, '') from word where lemma_key='לאכול|paal'" | qs)"
contains "anon cannot call it" "permission denied" "$(echo "select save_verb_occurrence('{\"word\":\"x\",\"lemma_key\":\"x\"}', '{\"surface\":\"x\"}')" | as anon)"
contains "a session without email cannot call it" "not signed in" "$(echo "select save_verb_occurrence('{\"word\":\"x\",\"lemma_key\":\"x\"}', '{\"surface\":\"x\"}')" | as "")"
contains "an empty infinitive is refused" "invalid word" "$(echo "select save_verb_occurrence('{\"word\":\"\",\"lemma_key\":\"x\"}', '{\"surface\":\"x\"}')" | as a@x.com)"
contains "an empty surface is refused" "invalid word" "$(echo "select save_verb_occurrence('{\"word\":\"x\",\"lemma_key\":\"x\"}', '{\"surface\":\" \"}')" | as a@x.com)"
contains "a lemma_key with nikud is refused" "invalid word" "$(printf "select save_verb_occurrence('{\"word\":\"x\",\"lemma_key\":\"לְהַנִּיחַ\"}', '{\"surface\":\"x\"}')" | as a@x.com)"
contains "an unknown language is refused" "invalid input value for enum" "$(echo "select save_verb_occurrence('{\"word\":\"x\",\"lemma_key\":\"x\",\"language\":\"klingon\"}', '{\"surface\":\"x\"}')" | as a@x.com)"
out=$(as a@x.com <<'SQL'
select r->'word'->'verb_forms'->0 ? 'evil', r->'word'->'verb_forms'->0->>'tense', length(r->'word'->'verb_forms'->0->>'sentence')
from save_verb_occurrence('{"word":"לִכְתֹּב","lemma_key":"לכתוב|paal","times_practiced":"99"}',
  ('{"surface":"כתבתי","evil":"x","tense":"yesterday","sentence":"' || repeat('a', 2000) || '"}')::jsonb) r;
SQL
)
check "unknown fields dropped, bad grammar dropped, long text cut" "f||500" "$out"
check "a bad rating value is not stored" "0" "$(echo "select times_practiced from word where lemma_key='לכתוב|paal'" | qs)"
contains "a second card with the same infinitive is refused by the database" "duplicate key" \
  "$(echo "insert into word (word, language, lemma_key) values ('x', 'hebrew', 'להניח|hifil')" | as a@x.com)"

echo "== 6. concurrency: one card, every form"
for i in $(seq 1 10); do save c@x.com 'לרוץ|paal' "רצתי$i" vid-c > "$TMP/c.$i" 2>&1 & done; wait
check "10 different forms saved at once by one student: 1 card" "1" "$(echo "select count(*) from word where lemma_key='לרוץ|paal'" | qs)"
check "…holding all 10 forms" "10" "$(echo "select jsonb_array_length(verb_forms) from word where lemma_key='לרוץ|paal'" | qs)"
check "…exactly one save reported 'created'" "1" "$(cat "$TMP"/c.* | grep -c '^true|')"
for i in $(seq 1 10); do save d@x.com 'לשיר|paal' "שרתי" vid-d > "$TMP/d.$i" 2>&1 & done; wait
check "the same form saved 10 times at once: 1 card, 1 form" "1|1" "$(echo "select count(*)||'|'||max(jsonb_array_length(verb_forms)) from word where lemma_key='לשיר|paal'" | qs)"

echo "== 7. verb_lexicon: only the server writes, one maker per verb"
contains "students cannot claim a verb" "permission denied" "$(echo "select * from verb_lexicon_claim('hebrew','k','x')" | as a@x.com)"
contains "students cannot save a table" "permission denied" "$(echo "select verb_lexicon_save('hebrew','k',gen_random_uuid(),'{\"conjugations\":{\"past\":{}}}')" | as a@x.com)"
contains "students cannot write the table directly" "permission denied" "$(echo "insert into verb_lexicon (language, lemma_key) values ('hebrew','k')" | as a@x.com)"
contains "anon cannot read it" "permission denied" "$(echo "select lemma from verb_lexicon" | as anon)"
contains "anon cannot even call the spelling helper" "permission denied" "$(echo "select verb_surface_key('x')" | as anon)"
for i in $(seq 1 12); do echo "select lock_token from verb_lexicon_claim('hebrew','k1','לִכְתֹּב')" | qs > "$TMP/k.$i" 2>&1 & done; wait
check "12 simultaneous claims on a new verb: exactly 1 gets the token" "1" "$(cat "$TMP"/k.* | grep -c -E '^[0-9a-f-]{36}$')"
T=$(echo "select lock_token from verb_lexicon where lemma_key='k1'" | qs)
check "claiming while it is held returns nothing" "" "$(echo "select lock_token from verb_lexicon_claim('hebrew','k1','x')" | qs)"
check "save with a wrong token is refused" "f" "$(echo "select verb_lexicon_save('hebrew','k1',gen_random_uuid(),'{\"conjugations\":{\"past\":{\"1s\":{\"he\":\"x\"}}}}')" | qs)"
contains "save without a table is refused" "conjugation table is required" "$(echo "select verb_lexicon_save('hebrew','k1','$T','{\"conjugations\":{}}')" | qs)"
check "save with the token stores it" "t" "$(echo "select verb_lexicon_save('hebrew','k1','$T','{\"conjugations\":{\"past\":{\"1s\":{\"he\":\"כתבתי\"}}},\"model\":\"m\"}')" | qs)"
check "…ready, unlocked" "ready||" "$(echo "select status||'|'||coalesce(lock_token::text,'')||'|'||coalesce(locked_until::text,'') from verb_lexicon where lemma_key='k1'" | qs)"
check "a finished verb is never claimed again (no second payment)" "" "$(echo "select lock_token from verb_lexicon_claim('hebrew','k1','x')" | qs)"
check "…nor saved again" "f" "$(echo "select verb_lexicon_save('hebrew','k1','$T','{\"conjugations\":{\"past\":{\"1s\":{\"he\":\"x\"}}}}')" | qs)"
check "students can read a finished table" "כתבתי" "$(echo "select conjugations->'past'->'1s'->>'he' from verb_lexicon where lemma_key='k1'" | as a@x.com)"
contains "…but not the lock columns" "permission denied" "$(echo "select lock_token from verb_lexicon" | as a@x.com)"
contains "…nor who requested a verb (an email)" "permission denied" "$(echo "select requested_by from verb_lexicon" | as a@x.com)"
check "the default lease is 400 s" "t" "$(echo "select locked_until > now() + interval '390 seconds' from verb_lexicon_claim('hebrew','k-lease','x')" | qs)"
echo "select lock_token from verb_lexicon_claim('hebrew','n1','x', 60, 2, 's@x.com', 2)" | qs >/dev/null
echo "select lock_token from verb_lexicon_claim('hebrew','n2','x', 60, 2, 's@x.com', 2)" | qs >/dev/null
contains "a third NEW verb the same day is refused (daily limit 2)" "daily limit" "$(echo "select lock_token from verb_lexicon_claim('hebrew','n3','x', 60, 2, 's@x.com', 2)" | qs)"
check "…without creating its row" "0" "$(echo "select count(*) from verb_lexicon where lemma_key='n3'" | qs)"
contains "…while another student can still start it" "-" "$(echo "select lock_token from verb_lexicon_claim('hebrew','n3','x', 60, 2, 't@x.com', 2)" | qs)"
echo "update verb_lexicon set locked_until = now() - interval '1 second' where lemma_key = 'n1'" | qs >/dev/null
contains "…and retrying a verb already started is not a NEW verb" "-" "$(echo "select lock_token from verb_lexicon_claim('hebrew','n1','x', 60, 2, 's@x.com', 2)" | qs)"
A=$(echo "select lock_token from verb_lexicon_claim('hebrew','k2','x', 1)" | qs); sleep 2
B=$(echo "select lock_token from verb_lexicon_claim('hebrew','k2','x', 60)" | qs)
contains "after the lease expires the verb can be claimed again" "-" "$B"
check "the expired holder can no longer save" "f" "$(echo "select verb_lexicon_save('hebrew','k2','$A','{\"conjugations\":{\"past\":{\"1s\":{\"he\":\"x\"}}}}')" | qs)"
check "…nor give it back" "f" "$(echo "select verb_lexicon_fail('hebrew','k2','$A','x')" | qs)"
check "a failed call gives it back" "t" "$(echo "select verb_lexicon_fail('hebrew','k2','$B','model error')" | qs)"
check "after 2 attempts it is not claimed again" "" "$(echo "select lock_token from verb_lexicon_claim('hebrew','k2','x')" | qs)"
C=$(echo "select lock_token from verb_lexicon_claim('hebrew','k3','x')" | qs)
echo "select verb_lexicon_fail('hebrew','k3','$C','no credit', true)" | qs >/dev/null
check "an account failure (refund) does not use up an attempt" "0" "$(echo "select attempts from verb_lexicon where lemma_key='k3'" | qs)"

echo "== 8. verbConjugations against these SQL functions (fake model)"
TEST_DATABASE_URL="postgres://postgres:x@127.0.0.1:$PORT/postgres" DENO_NO_PACKAGE_JSON=1 \
  deno test --no-lock --node-modules-dir=none -A supabase/functions/verbConjugations/conjugate.test.ts > "$TMP/deno.out" 2>&1
grep -E "^(memory|postgres) ·" "$TMP/deno.out" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/ \.\.\. / → /; s/ ([0-9.]*m\?s)$//' | sed 's/^/  /'
check "verbConjugations tests (memory + postgres) all pass" "0" "$(sed 's/\x1b\[[0-9;]*m//g' "$TMP/deno.out" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo missing)"
check "…and none was skipped" "0" "$(sed 's/\x1b\[[0-9;]*m//g' "$TMP/deno.out" | grep -oE '[0-9]+ ignored' | grep -oE '[0-9]+' || echo 0)"

echo "== 9. rollback and re-apply"
before=$(echo "select count(*) from word" | qs)
lex=$(echo "select count(*) from verb_lexicon" | qs)
out=$(qs < supabase/rollback/2200_word_verb_forms_down.sql); check "rollback applies" "" "$out"
check "no word row is lost" "$before" "$(echo "select count(*) from word" | qs)"
check "verb cards stay as cards with their infinitive" "1" "$(echo "select count(*) from word where word='לְהַנִּיחַ' and created_by='a@x.com'" | qs)"
check "the forms are archived" "4" "$(echo "select jsonb_array_length(verb_forms) from word_verb_forms_archive_2200 where lemma_key='להניח|hifil' and created_by='a@x.com'" | qs)"
check "the conjugation tables are archived" "$lex" "$(echo "select count(*) from verb_lexicon_archive_2200" | qs)"
check "columns, table and functions are gone" "0|0|0" "$(echo "select (select count(*) from information_schema.columns where table_name='word' and column_name in ('lemma_key','verb_forms'))||'|'||(select count(*) from pg_class where relname='verb_lexicon')||'|'||(select count(*) from pg_proc where proname like 'verb_lexicon_%' or proname='save_verb_occurrence')" | qs)"
contains "archives are closed to students" "permission denied" "$(echo "select * from word_verb_forms_archive_2200" | as a@x.com)"
check "the app's plain saves still work after the rollback" "" "$(echo "insert into word (word) values ('אחרי')" | as a@x.com)"
out=$(qs < supabase/rollback/2200_word_verb_forms_down.sql); check "rollback runs twice safely" "" "$out"
out=$(qs < supabase/migrations/2200_word_verb_forms.sql); check "2200 applies again after a rollback" "" "$out"
check "…and works" "true|1" "$(save e@x.com 'לקום|paal' 'קמתי' vid-e)"

echo
echo "$PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
