#!/usr/bin/env bash
# Tests migration 2100 (chapter_prep) against a throwaway local PostgreSQL 17
# in Docker, with the real 1900 + 2100 migrations. Never touches Supabase.
#
#   bash supabase/tests/chapter_prep_test.sh
#
# Needs Docker running. Uses short leases (1–2 s) to test expiry.
set -u
cd "$(dirname "$0")/../.."
NAME=chapter-prep-test
PASS=0; FAIL=0

docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=x postgres:17-alpine >/dev/null || exit 1
trap 'docker rm -f $NAME >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do docker exec $NAME pg_isready -U postgres -q && break; sleep 1; done
sleep 2

q()  { docker exec -i $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
qs() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 2>&1; }   # SQL from stdin
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected: $2"; echo "       actual:   $3"; fi
}
contains() { # name needle haystack
  case "$3" in *"$2"*) PASS=$((PASS+1)); echo "  ok   $1";; *) FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected to contain: $2"; echo "       actual: $3";; esac
}
claim() { q "select lock_token from chapter_prep_claim('$1','hebrew',${2:-180},${3:-false})"; }
DONE='[{"start":0,"end":2,"text":"a","transliteration":"a","english":"a"},{"start":2,"end":4,"text":"b","transliteration":"b","english":"b"}]'
PARTIAL='[{"start":0,"end":2,"text":"a","transliteration":"a","english":"a"},{"start":2,"end":4,"text":"b","transliteration":"b","english":" "}]'

echo "== setup: Supabase roles + migrations 1900 and 2100"
qs >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- A platform admin in tests: a session with test.admin = on.
create function public.is_platform_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
-- Same default privileges as production (pg_default_acl, checked 2026-10-14):
-- every new table and function in public is granted to anon/authenticated.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
SQL
out=$(qs < supabase/migrations/1900_chapter_content.sql); check "1900 applies" "" "$out"
out=$(qs < supabase/migrations/2100_chapter_prep.sql);    check "2100 applies" "" "$out"
out=$(qs < supabase/migrations/2100_chapter_prep.sql);    check "2100 applies twice (idempotent)" "" "$out"

echo "== 1. atomic claim"
for i in $(seq 1 12); do claim v-claim > /tmp/claim.$i 2>&1 & done; wait
got=$(cat /tmp/claim.* | grep -c -E '^[0-9a-f-]{36}$'); rm -f /tmp/claim.*
check "12 simultaneous claims on a new video: exactly 1 gets the token" "1" "$got"
check "claiming again while the lease is valid returns nothing" "" "$(claim v-claim)"
claim v-exp 1 >/dev/null; sleep 2
t2=$(claim v-exp)
contains "after the lease expires the video can be claimed again" "-" "$t2"
check "that new claim counts as a second attempt, hops reset" "2|0" "$(q "select attempts||'|'||hops from chapter_prep where video_id='v-exp'")"
check "lease is capped at 900 s" "t" "$(q "select locked_until <= now() + interval '900 seconds' from chapter_prep_claim('v-cap','hebrew',5000)")"

echo "== 2. an expired token can neither modify nor publish"
A=$(claim v-stale 1); sleep 2; B=$(claim v-stale)
check "stale A: save refused"      "f" "$(q "select chapter_prep_save('v-stale','$A','{\"status\":\"transcribing\",\"audio_key\":\"evil\"}')")"
check "stale A: add_batch refused" "f" "$(q "select chapter_prep_add_batch('v-stale','$A',null,0,'{\"x\":1}')")"
contains "stale A: publish refused" "lease lost" "$(q "select chapter_prep_publish('v-stale','$A','$DONE','A',true)")"
check "stale A: release refused (B holds it)" "f" "$(q "select chapter_prep_release('v-stale','$A','failed','x','A failed')")"
check "nothing from A got in"      "|{}|queued" "$(q "select coalesce(audio_key,'')||'|'||batches::text||'|'||status from chapter_prep where video_id='v-stale'")"
check "chapter_content untouched"  "0" "$(q "select count(*) from chapter_content where video_id='v-stale'")"
check "current holder B can save" "t" "$(q "select chapter_prep_save('v-stale','$B','{\"status\":\"transcribing\",\"audio_key\":\"ak1\"}')")"
C=$(claim v-lapsed 1); sleep 2
check "expired, not taken over: save refused"      "f" "$(q "select chapter_prep_save('v-lapsed','$C','{\"status\":\"translating\"}')")"
contains "expired, not taken over: publish refused" "lease lost" "$(q "select chapter_prep_publish('v-lapsed','$C','$DONE','C',false)")"
check "expired, not taken over: may still release" "t" "$(q "select chapter_prep_release('v-lapsed','$C','failed','timeout','ran out of time')")"

echo "== 3. lease length vs external calls (lease renewed by every write)"
L=$(claim v-lease 3)
sleep 2; q "select chapter_prep_save('v-lease','$L','{\"status\":\"transcribing\"}',3)" >/dev/null
sleep 2
check "a run that keeps saving keeps its lease past the first 3 s" "t" "$(q "select chapter_prep_save('v-lease','$L','{\"status\":\"translating\"}',3)")"
check "default lease is 180 s (above the 135 s transcription budget)" "t" "$(q "select locked_until between now() + interval '179 seconds' and now() + interval '181 seconds' from chapter_prep_claim('v-default','hebrew')")"

echo "== 4. finished batches survive errors"
T=$(claim v-batch)
q "select chapter_prep_save('v-batch','$T','{\"audio_key\":\"ak1\",\"segment_key\":\"sk1\",\"sentences\":[{\"text\":\"a\"}],\"translate_key\":\"tk1\",\"batch_size\":8,\"batches\":{}}')" >/dev/null
for i in 0 1 2 3 4; do q "select chapter_prep_add_batch('v-batch','$T','tk1',$i,'{\"items\":[$i]}')" >/dev/null & done; wait
check "5 batches saved at the same time: all 5 kept" "0,1,2,3,4" "$(q "select string_agg(k, ',' order by k) from chapter_prep, jsonb_object_keys(batches) k where video_id='v-batch'")"
check "a batch for an old translate_key is ignored" "f" "$(q "select chapter_prep_add_batch('v-batch','$T','tk-old',7,'{}')")"
q "select chapter_prep_release('v-batch','$T','blocked','credit','Your credit balance is too low')" >/dev/null
check "after a credit error: status blocked, batches kept" "blocked|credit|5" "$(q "select status||'|'||error_kind||'|'||(select count(*) from jsonb_object_keys(batches)) from chapter_prep where video_id='v-batch'")"
T2=$(claim v-batch)
check "a new run sees the cached sentences and batches" "sk1|tk1|5" "$(q "select segment_key||'|'||translate_key||'|'||(select count(*) from jsonb_object_keys(batches)) from chapter_prep where video_id='v-batch'")"
q "select chapter_prep_save('v-batch','$T2','{\"segment_key\":\"sk2\",\"translate_key\":\"tk2\",\"batches\":{}}')" >/dev/null
check "new lyrics (segment_key) reset only sentences/batches, not the audio" "ak1|sk2|0" "$(q "select audio_key||'|'||segment_key||'|'||(select count(*) from jsonb_object_keys(batches)) from chapter_prep where video_id='v-batch'")"
check "save cannot set status ready" "ready is set only" "$(q "select chapter_prep_save('v-batch','$T2','{\"status\":\"ready\"}')" | grep -o 'ready is set only')"

echo "== 5. publication keeps the phase 1 rules"
P=$(claim v-pub)
contains "empty chapter refused"      "no sentences" "$(q "select chapter_prep_publish('v-pub','$P','[]','x',false)")"
contains "incomplete chapter refused" "1 of 2 sentences untranslated" "$(q "select chapter_prep_publish('v-pub','$P','$PARTIAL','x',false)")"
check "nothing published, prep not ready" "0|queued" "$(q "select (select count(*) from chapter_content where video_id='v-pub')||'|'||status from chapter_prep where video_id='v-pub'")"
check "complete chapter published" "published" "$(q "select chapter_prep_publish('v-pub','$P','$DONE','eleven',false)")"
check "prep ready, lease freed" "ready||true" "$(q "select status||'|'||coalesce(lock_token::text,'')||'|'||(locked_until is null) from chapter_prep where video_id='v-pub'")"

echo "== 6. existing published content is protected"
q "insert into chapter_content (video_id, language, sentences, source) values ('v-live','hebrew','$DONE','original')" >/dev/null
E=$(claim v-live)
check "without force: kept_existing" "kept_existing" "$(q "select chapter_prep_publish('v-live','$E','$DONE','rebuilt',false)")"
check "original still published"     "original" "$(q "select source from chapter_content where video_id='v-live'")"
E=$(claim v-live)
contains "force + incomplete: refused" "untranslated" "$(q "select chapter_prep_publish('v-live','$E','$PARTIAL','broken',true)")"
check "original still published"     "original" "$(q "select source from chapter_content where video_id='v-live'")"
check "force + complete: replaced"    "published|rebuilt" "$(q "select chapter_prep_publish('v-live','$E','$DONE','rebuilt',true)")|$(q "select source from chapter_content where video_id='v-live'")"
OLD=$(claim v-race 1); sleep 2; NEW=$(claim v-race)
check "newer forced rebuild publishes" "published" "$(q "select chapter_prep_publish('v-race','$NEW','$DONE','newer',true)")"
contains "older forced rebuild (expired) can no longer overwrite" "lease lost" "$(q "select chapter_prep_publish('v-race','$OLD','$DONE','older',true)")"
check "the newer version stays"       "newer" "$(q "select source from chapter_content where video_id='v-race'")"

echo "== 7. runs out of continuations: pending_recovery"
R=$(claim v-rec); q "select chapter_prep_release('v-rec','$R','queued')" >/dev/null
for h in 1 2 3; do R=$(claim v-rec 180 true); q "select chapter_prep_release('v-rec','$R','queued')" >/dev/null; done
R=$(claim v-rec 180 true)
check "continuations counted as hops, not attempts" "4|1" "$(q "select hops||'|'||attempts from chapter_prep where video_id='v-rec'")"
q "select chapter_prep_release('v-rec','$R','pending_recovery',null,null,'max continuations reached (4)')" >/dev/null
check "identified as pending recovery, with the reason" "pending_recovery|max continuations reached (4)" "$(q "select status||'|'||recovery_reason from chapter_prep where video_id='v-rec'")"
check "listed by the not-ready index query" "v-rec" "$(q "select video_id from chapter_prep where status='pending_recovery'")"
contains "release refuses a status like ready" "invalid final status" "$(q "select chapter_prep_release('v-rec','$R','ready')")"

echo "== 8. permissions"
check "app (authenticated) reads the status only" "pending_recovery|false|true" "$(q "set role authenticated; select status||'|'||busy||'|'||resumable from chapter_prep_status('v-rec')")"
contains "app cannot read the table"   "permission denied" "$(q "set role authenticated; select count(*) from chapter_prep")"
contains "app cannot claim"            "permission denied" "$(q "set role authenticated; select chapter_prep_claim('v-x','hebrew')")"
contains "app cannot publish"          "permission denied" "$(q "set role authenticated; select chapter_prep_publish('v-x',gen_random_uuid(),'[]','x',true)")"
contains "anon cannot read the status" "permission denied" "$(q "set role anon; select * from chapter_prep_status('v-rec')")"
check "service role can claim"          "1" "$(q "set role service_role; select count(*) from chapter_prep_claim('v-svc','hebrew')")"
check "unknown video: no status row"    "0" "$(q "set role authenticated; select count(*) from chapter_prep_status('nope')")"
contains "app cannot call the lease helper" "permission denied" "$(q "set role authenticated; select chapter_prep_lease(10)")"
contains "anon cannot call the lease helper" "permission denied" "$(q "set role anon; select chapter_prep_lease(10)")"
contains "app cannot write the table" "permission denied" "$(q "set role authenticated; insert into chapter_prep (video_id, language) values ('x','hebrew')")"
check "status exposes only status, busy, resumable" "status,busy,resumable" "$(q "select string_agg(parameter_name, ',' order by ordinal_position) from information_schema.parameters where specific_schema='public' and specific_name like 'chapter_prep_status%' and parameter_mode='OUT'")"

echo "== 9. resumable: only failures a retry can fix, at most 5 attempts"
st() { q "set role authenticated; select busy||'|'||resumable from chapter_prep_status('$1')"; }
X=$(claim r-blocked); q "select chapter_prep_release('r-blocked','$X','blocked','credit','no credit')" >/dev/null
check "blocked (no credit): not resumable"            "false|false" "$(st r-blocked)"
X=$(claim r-transc);  q "select chapter_prep_release('r-transc','$X','failed','transcription','no words')" >/dev/null
check "failed transcription: not resumable (would pay again)" "false|false" "$(st r-transc)"
X=$(claim r-busy);    q "select chapter_prep_release('r-busy','$X','failed','overloaded','529')" >/dev/null
check "failed overloaded: resumable"                   "false|true" "$(st r-busy)"
X=$(claim r-held)
check "held by a run: busy, not resumable"             "true|false" "$(st r-held)"
X=$(claim r-cut 1); q "select chapter_prep_save('r-cut','$X','{\"status\":\"translating\"}',1)" >/dev/null; sleep 2
check "run cut off mid-translation (lease expired): resumable" "false|true" "$(st r-cut)"
for i in 1 2 3 4 5; do X=$(claim r-many); q "select chapter_prep_release('r-many','$X','failed','overloaded','529')" >/dev/null; done
check "after 5 attempts: not resumable"                "false|false" "$(st r-many)"
X=$(claim r-pend); q "select chapter_prep_release('r-pend','$X','pending_recovery',null,null,'max continuations reached (4)')" >/dev/null
check "pending_recovery: resumable"                    "false|true" "$(st r-pend)"

echo "== 10. chapter_content writes: before and after migration 2110"
L='[{"start":0,"end":2,"text":"a","transliteration":"a","english":"a"}]'
check "before 2110: a student CAN insert a chapter (the hole being closed)" "" "$(q "set role authenticated; insert into chapter_content (video_id, language, sentences) values ('hole','hebrew','$L')")"
check "before 2110: a platform admin CAN delete one" "" "$(q "set test.admin = 'on'; set role authenticated; delete from chapter_content where video_id = 'hole'")"
out=$(qs < supabase/migrations/2110_chapter_content_server_writes.sql); check "2110 applies" "" "$out"
out=$(qs < supabase/migrations/2110_chapter_content_server_writes.sql); check "2110 applies twice (idempotent)" "" "$out"
q "insert into chapter_content (video_id, language, sentences, source) values ('c-live','hebrew','$L','original')" >/dev/null
check "student still reads chapters"              "1" "$(q "set role authenticated; select count(*) from chapter_content where video_id = 'c-live'")"
contains "student cannot insert"                  "permission denied" "$(q "set role authenticated; insert into chapter_content (video_id, language, sentences) values ('c-new','hebrew','$L')")"
contains "student cannot overwrite (update)"      "permission denied" "$(q "set role authenticated; update chapter_content set source = 'hacked' where video_id = 'c-live'")"
contains "student cannot upsert over a chapter"   "permission denied" "$(q "set role authenticated; insert into chapter_content (video_id, language, sentences) values ('c-live','hebrew','$L') on conflict (video_id) do update set source = 'hacked'")"
contains "student cannot delete"                  "permission denied" "$(q "set role authenticated; delete from chapter_content where video_id = 'c-live'")"
contains "platform admin cannot delete directly either" "permission denied" "$(q "set test.admin = 'on'; set role authenticated; delete from chapter_content where video_id = 'c-live'")"
contains "anon cannot read"                       "permission denied" "$(q "set role anon; select count(*) from chapter_content")"
contains "anon cannot insert"                     "permission denied" "$(q "set role anon; insert into chapter_content (video_id, language, sentences) values ('c-anon','hebrew','$L')")"
check "published chapter untouched"               "original" "$(q "select source from chapter_content where video_id = 'c-live'")"
check "service role (edge functions) can still write" "" "$(q "set role service_role; update chapter_content set source = 'svc' where video_id = 'c-live'")"
P=$(q "set role service_role; select lock_token from chapter_prep_claim('c-pub','hebrew')")
check "server publication (chapter_prep_publish as service role) still works" "published" "$(q "set role service_role; select chapter_prep_publish('c-pub','$P','$L','eleven',false)")"
check "…and students read it"                     "1" "$(q "set role authenticated; select count(*) from chapter_content where video_id = 'c-pub'")"
contains "students still cannot call the publication function" "permission denied" "$(q "set role authenticated; select chapter_prep_publish('c-x',gen_random_uuid(),'$L','x',true)")"

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" = 0 ]
