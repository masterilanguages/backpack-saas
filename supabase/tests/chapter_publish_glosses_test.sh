#!/usr/bin/env bash
# Tests migration 2121 (glosses required to publish) against a throwaway local
# PostgreSQL 17 in Docker, with the real 1900 + 2100 + 2121 migrations.
# Never touches Supabase, no paid calls.
#
#   bash supabase/tests/chapter_publish_glosses_test.sh
set -u
cd "$(dirname "$0")/../.."
NAME=chapter-glosses-test
PASS=0; FAIL=0
docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=x postgres:17-alpine >/dev/null || exit 1
trap 'docker rm -f $NAME >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do docker exec $NAME pg_isready -U postgres -q && break; sleep 1; done
sleep 2
q()  { docker exec -i $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
qs() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 2>&1; }
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected: $2"; echo "       actual:   $3"; fi; }
contains() { case "$3" in *"$2"*) PASS=$((PASS+1)); echo "  ok   $1";; *) FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected to contain: $2"; echo "       actual: $3";; esac; }
claim() { q "select lock_token from chapter_prep_claim('$1','hebrew',180,false)"; }
publish() { q "select chapter_prep_publish('$1','$2','$3'::jsonb,'test',${4:-false})"; }

G='[{"w":"שלום","phonetic":"shalom","meaning":"hi"}]'
WITH_GLOSSES='[{"start":0,"end":2,"text":"שלום","transliteration":"shalom","english":"hi","words":'$G'},{"start":2,"end":4,"text":"hello there","transliteration":"hello there","english":"hello there","words":'$G'}]'
NO_GLOSSES='[{"start":0,"end":2,"text":"שלום","transliteration":"shalom","english":"hi","words":'$G'},{"start":2,"end":4,"text":"עוד","transliteration":"od","english":"more","words":[]}]'
MISSING_KEY='[{"start":0,"end":2,"text":"שלום","transliteration":"shalom","english":"hi"}]'
ONLY_DIGITS='[{"start":0,"end":2,"text":"שלום","transliteration":"shalom","english":"hi","words":'$G'},{"start":2,"end":4,"text":"24 ... !","transliteration":"24","english":"24"}]'
NAME_NO_MEANING='[{"start":0,"end":2,"text":"אלזה","transliteration":"elza","english":"Elsa","words":[{"w":"אלזה","phonetic":"elza","meaning":""}]}]'

echo "== setup: roles + 1900 + 2100"
out=$(qs <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create function public.is_platform_admin() returns boolean language sql as $$ select false $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
SQL
); check "setup" "" "$out"
out=$(qs < supabase/migrations/1900_chapter_content.sql); check "1900 applies" "" "$out"
out=$(qs < supabase/migrations/2100_chapter_prep.sql);    check "2100 applies" "" "$out"
t=$(claim v-before); check "before 2121: a chapter without glosses publishes (the gap)" "published" "$(publish v-before "$t" "$NO_GLOSSES")"

out=$(qs < supabase/migrations/2121_chapter_publish_glosses.sql); check "2121 applies" "" "$out"
out=$(qs < supabase/migrations/2121_chapter_publish_glosses.sql); check "2121 applies twice (idempotent)" "" "$out"
check "the chapter published before 2121 is untouched" "2" "$(q "select jsonb_array_length(sentences) from chapter_content where video_id='v-before'")"

echo "== the rule"
t=$(claim v-ok);   check "every sentence with glosses: published" "published" "$(publish v-ok "$t" "$WITH_GLOSSES")"
t=$(claim v-gap);  contains "a sentence with an empty glosses list: refused" "without transliteration, English or glosses" "$(publish v-gap "$t" "$NO_GLOSSES")"
check "…and nothing was published" "0" "$(q "select count(*) from chapter_content where video_id='v-gap'")"
t=$(claim v-nokey); contains "a sentence with no glosses key at all: refused" "without transliteration, English or glosses" "$(publish v-nokey "$t" "$MISSING_KEY")"
t=$(claim v-digits); check "digits / punctuation only need no glosses: published" "published" "$(publish v-digits "$t" "$ONLY_DIGITS")"
t=$(claim v-name);  check "a gloss without a meaning (a name) still counts: published" "published" "$(publish v-name "$t" "$NAME_NO_MEANING")"

echo "== a forced rebuild can't replace a good chapter with one without glosses"
t=$(claim v-ok); contains "forced publish without glosses: refused" "without transliteration, English or glosses" "$(publish v-ok "$t" "$NO_GLOSSES" true)"
check "…the published chapter is intact (still has its glosses)" "1" "$(q "select jsonb_array_length(sentences->1->'words') from chapter_content where video_id='v-ok'")"

echo "== rollback restores 2100, and 2121 re-applies"
rb=$(sed -n '/^-- ROLLBACK/,$p' supabase/migrations/2121_chapter_publish_glosses.sql | sed -n '/^-- begin;/,$p' | sed -E 's/^-- ?//')
out=$(printf "%s\n" "$rb" | qs); check "rollback applies" "" "$out"
t=$(claim v-rb); check "after rollback: no glosses publishes again (2100)" "published" "$(publish v-rb "$t" "$NO_GLOSSES")"
out=$(qs < supabase/migrations/2121_chapter_publish_glosses.sql); check "2121 re-applies" "" "$out"
t=$(claim v-rb2); contains "and refuses again" "without transliteration, English or glosses" "$(publish v-rb2 "$t" "$NO_GLOSSES")"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
