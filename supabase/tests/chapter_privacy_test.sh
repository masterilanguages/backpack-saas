#!/usr/bin/env bash
# Tests migration 2120 (chapter privacy) against a throwaway local PostgreSQL 17
# in Docker: the real 1900 + 2100 + 2120 migrations, the libraries' real RLS
# policies and the real permission helpers (copied from production on
# 2026-10-14), with Supabase's auth.uid() / auth.jwt() read from the session.
# Never touches Supabase, no paid calls.
#
#   bash supabase/tests/chapter_privacy_test.sh
#
# Needs Docker running.
set -u
cd "$(dirname "$0")/../.."
NAME=chapter-privacy-test
PASS=0; FAIL=0

docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=x postgres:17-alpine >/dev/null || exit 1
trap 'docker rm -f $NAME >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do docker exec $NAME pg_isready -U postgres -q && break; sleep 1; done
sleep 2

qs() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 2>&1; }   # SQL from stdin
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected: $2"; echo "       actual:   $3"; fi
}
contains() { # name needle haystack
  case "$3" in *"$2"*) PASS=$((PASS+1)); echo "  ok   $1";; *) FAIL=$((FAIL+1)); echo "  FAIL $1"; echo "       expected to contain: $2"; echo "       actual: $3";; esac
}

# Users (uid / email / app role)
ORG_A=aaaaaaaa-0000-0000-0000-000000000001
ORG_B=bbbbbbbb-0000-0000-0000-000000000002
S1=10000000-0000-0000-0000-000000000001   # student, school A (saves private videos)
S2=10000000-0000-0000-0000-000000000002   # student, school A (saved nothing)
S3=10000000-0000-0000-0000-000000000003   # student, school B
C1=20000000-0000-0000-0000-000000000001   # coach of S1, school A
A1=30000000-0000-0000-0000-000000000001   # school A admin (membership role admin)
P1=40000000-0000-0000-0000-000000000001   # platform admin

# as <uid> <email> <sql>: runs <sql> as that signed-in user, prints the result.
as() {
  printf "begin;\nset local role authenticated;\nselect set_config('request.jwt.claims', '{\"sub\":\"%s\",\"email\":\"%s\",\"app_metadata\":{\"user_role\":\"%s\"}}', true);\n%s\ncommit;\n" \
    "$1" "$2" "${4:-user}" "$3" | qs | sed '1d'   # drop set_config's output line
}
anon() { printf "begin;\nset local role anon;\n%s\ncommit;\n" "$1" | qs; }
svc()  { printf "begin;\nset local role service_role;\n%s\ncommit;\n" "$1" | qs; }
status() { as "$1" "$2" "select status||'|'||busy||'|'||resumable from chapter_prep_status('$3');" "${4:-user}"; }
reads()  { as "$1" "$2" "select count(*) from chapter_content where video_id = '$3';" "${4:-user}"; }

echo "== setup: Supabase roles, auth.*, libraries with their production RLS"
out=$(qs <<SQL
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as \$\$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb \$\$;
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(auth.jwt()->>'sub', '')::uuid \$\$;

create table public.memberships (user_id uuid, org_id uuid, role text);
create table public.platform_admins (user_id uuid);
create table public.coach_assignment (coach_email text, student_email text, org_id uuid);
create table public.media_library (id serial primary key, video_id text, org_id uuid, title text);
create table public.user_saved_video (id serial primary key, video_id text, created_by text, org_id uuid, title text);

-- Permission helpers, as in production.
create function public.app_email() returns text language sql stable as \$\$ select auth.jwt()->>'email' \$\$;
create function public.app_role() returns text language sql stable as \$\$ select coalesce(auth.jwt()->'app_metadata'->>'user_role', 'user') \$\$;
create function public.my_org_ids() returns setof uuid language sql stable security definer set search_path = public, pg_temp as \$\$
  select m.org_id from public.memberships m where m.user_id = auth.uid() \$\$;
create function public.is_platform_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as \$\$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()) \$\$;
create function public.has_org_role(p_org uuid, p_min text) returns boolean language sql stable security definer set search_path = public, pg_temp as \$\$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.user_id = auth.uid() and m.org_id = p_org
      and (case m.role when 'owner' then 4 when 'admin' then 3 when 'coach' then 2 when 'student' then 1 else 0 end)
       >= (case p_min  when 'owner' then 4 when 'admin' then 3 when 'coach' then 2 when 'student' then 1 else 0 end)) \$\$;
create function public.coach_of_email(p_email text) returns boolean language sql stable security definer set search_path = public, pg_temp as \$\$
  select exists (select 1 from public.coach_assignment ca where ca.coach_email = public.app_email() and ca.student_email = p_email
    and (ca.org_id is null or ca.org_id = any (select public.my_org_ids()))) \$\$;

-- The libraries' SELECT policies, verbatim from production.
alter table public.media_library enable row level security;
create policy media_library_org_select on public.media_library for select
  using ((org_id is null) or (org_id in (select my_org_ids())) or is_platform_admin());
alter table public.user_saved_video enable row level security;
create policy user_saved_video_org_select on public.user_saved_video for select
  using (((org_id is null) or (org_id in (select my_org_ids())) or is_platform_admin())
     and ((app_role() = 'admin') or has_org_role(org_id, 'admin') or is_platform_admin() or (created_by = app_email()) or coach_of_email(created_by)));

-- People.
insert into public.memberships values
  ('$S1','$ORG_A','student'), ('$S2','$ORG_A','student'), ('$S3','$ORG_B','student'),
  ('$C1','$ORG_A','coach'), ('$A1','$ORG_A','admin');
insert into public.platform_admins values ('$P1');
insert into public.coach_assignment values ('c1@x', 's1@x', '$ORG_A');
SQL
); check "setup" "" "$out"

out=$(qs < supabase/migrations/1900_chapter_content.sql); check "1900 applies" "" "$out"
out=$(qs < supabase/migrations/2100_chapter_prep.sql);    check "2100 applies" "" "$out"

echo "== data: catalogs, private saves, chapters and preparations"
out=$(qs <<SQL
insert into public.media_library (video_id, org_id, title) values ('cat-a', '$ORG_A', 'School A catalog'), ('cat-b', '$ORG_B', 'School B catalog');
-- S1 saves a private video; it is being prepared, no chapter yet.
insert into public.user_saved_video (video_id, created_by, org_id) values ('priv-s1', 's1@x', '$ORG_A');
insert into public.chapter_prep (video_id, language, status, attempts, lock_token, locked_until)
  values ('priv-s1', 'hebrew', 'transcribing', 1, gen_random_uuid(), now() + interval '3 minutes');
-- S1 (school A) and S3 (school B) both saved the same YouTube video: one chapter.
insert into public.user_saved_video (video_id, created_by, org_id) values ('same', 's1@x', '$ORG_A'), ('same', 's3@x', '$ORG_B');
-- A private video of S1 whose preparation hit an account problem.
insert into public.user_saved_video (video_id, created_by, org_id) values ('blk', 's1@x', '$ORG_A');
insert into public.chapter_prep (video_id, language, status, attempts, error_kind) values ('blk', 'hebrew', 'blocked', 1, 'billing');
-- Published chapters.
insert into public.chapter_content (video_id, language, sentences) values
  ('cat-a', 'hebrew', '[]'), ('cat-b', 'hebrew', '[]'), ('same', 'hebrew', '[]'), ('priv-done', 'hebrew', '[]');
insert into public.user_saved_video (video_id, created_by, org_id) values ('priv-done', 's1@x', '$ORG_A');
SQL
); check "data" "" "$out"

# What every role reads, and every policy and grant on the existing tables:
# taken before 2120 and compared after it — they must not change.
seen()     { as "$1" "$2" "select coalesce(string_agg(video_id, ',' order by video_id), '-') from chapter_content;" "${3:-user}"; }
policies() { qs <<<"select md5(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' order by tablename, policyname)) from pg_policies where tablename in ('chapter_content','media_library','user_saved_video','chapter_prep');"; }
grants()   { qs <<<"select md5(string_agg(grantee||'|'||table_name||'|'||privilege_type, E'\n' order by grantee, table_name, privilege_type)) from information_schema.role_table_grants where table_schema='public' and table_name in ('chapter_content','media_library','user_saved_video','chapter_prep');"; }
snapshot() {
  echo "S1=$(seen $S1 s1@x) S2=$(seen $S2 s2@x) S3=$(seen $S3 s3@x) C1=$(seen $C1 c1@x) A1=$(seen $A1 a1@x) P1=$(seen $P1 p1@x) ADM=$(seen $S2 s2@x admin) ANON=$(anon "select count(*) from chapter_content;") SVC=$(svc "select count(*) from chapter_content;") POL=$(policies) GR=$(grants)"
}

echo "== before 2120: chapter reads (unchanged after) and the status leak (fixed after)"
BEFORE=$(snapshot)
echo "$BEFORE" | tr ' ' '\n' | sed 's/^/    /' | head -9
check "S2 (didn't save it) reads S1's private status"     "transcribing|true|false" "$(status $S2 s2@x priv-s1)"
check "a student sees the 'blocked' account problem"      "blocked|false|false" "$(status $S2 s2@x blk)"

out=$(qs < supabase/migrations/2120_chapter_privacy.sql); check "2120 applies" "" "$out"
out=$(qs < supabase/migrations/2120_chapter_privacy.sql); check "2120 applies twice (idempotent)" "" "$out"

echo "== 1. nothing else changes: chapters, policies and grants are identical"
AFTER=$(snapshot)
check "every role reads exactly the same chapters, and every policy and grant is the same" "$BEFORE" "$AFTER"
check "chapter_content_read is still 1900's (true, to authenticated)" "true|{authenticated}" "$(qs <<<"select qual||'|'||roles::text from pg_policies where tablename='chapter_content' and policyname='chapter_content_read';")"
check "S2 still reads S1's private chapter, as before 2120"  "1" "$(reads $S2 s2@x priv-done)"
check "S3 (other school) still reads it too, as before"      "1" "$(reads $S3 s3@x priv-done)"

echo "== 2. a student's own private video: its status, before its chapter exists"
check "S1 sees its preparation status (busy, no chapter yet)" "transcribing|true|false" "$(status $S1 s1@x priv-s1)"
check "S2, same school, didn't save it: nothing"          "" "$(status $S2 s2@x priv-s1)"
check "S3, other school: nothing"                         "" "$(status $S3 s3@x priv-s1)"

echo "== 3. coach, school admin, platform admin, catalog"
check "S1's coach sees S1's private status"               "transcribing|true|false" "$(status $C1 c1@x priv-s1)"
check "school A admin sees S1's private status"           "transcribing|true|false" "$(status $A1 a1@x priv-s1)"
check "platform admin sees any status"                    "transcribing|true|false" "$(status $P1 p1@x priv-s1)"
out=$(svc "insert into chapter_prep (video_id, language, status, attempts, lock_token, locked_until) values ('cat-b', 'hebrew', 'translating', 1, gen_random_uuid(), now() + interval '3 minutes');")
check "S3 sees the status of its school's catalog video"  "translating|true|false" "$(status $S3 s3@x cat-b)"
check "S2 (another school) doesn't"                       "" "$(status $S2 s2@x cat-b)"

echo "== 4. two students saved the same video"
out=$(svc "insert into chapter_prep (video_id, language, status, attempts) values ('same', 'hebrew', 'ready', 1);")
check "S1 sees the shared video's status"                 "ready|false|false" "$(status $S1 s1@x same)"
check "S3 (other school, saved it too) sees it"           "ready|false|false" "$(status $S3 s3@x same)"
check "S2 (didn't save it) doesn't"                       "" "$(status $S2 s2@x same)"
check "S3 doesn't learn who else saved it"                "1" "$(as $S3 s3@x "select count(*) from user_saved_video where video_id='same';")"

echo "== 5. account problems stay with admins"
check "S1 sees its blocked preparation as 'failed'"       "failed|false|false" "$(status $S1 s1@x blk)"
check "platform admin sees 'blocked'"                     "blocked|false|false" "$(status $P1 p1@x blk)"
check "an app-role admin sees 'blocked'"                  "blocked|false|false" "$(status $S1 s1@x blk admin)"

echo "== 6. the new helpers can't be used to get around it"
contains "anon can't call chapter_prep_status"            "permission denied" "$(anon "select * from chapter_prep_status('cat-a');")"
contains "anon can't call the private helper"             "permission denied" "$(anon "select * from private.chapter_prep_status_raw('priv-s1');")"
check "anon has no usage on schema private"               "f" "$(qs <<<"select has_schema_privilege('anon','private','usage');")"
check "can_see_video only tells the caller what it can already see" "f" "$(as $S2 s2@x "select can_see_video('priv-s1');")"
check "...and is true for the owner"                      "t" "$(as $S1 s1@x "select can_see_video('priv-s1');")"
check "students still can't read chapter_prep directly"   "permission denied for table chapter_prep" "$(as $S1 s1@x "select count(*) from chapter_prep;" | grep -o 'permission denied for table chapter_prep')"
check "service_role (prepareChapter) still gets any status" "transcribing|true|false" "$(svc "select status||'|'||busy||'|'||resumable from chapter_prep_status('priv-s1');")"
check "chapter_prep_status is SECURITY INVOKER now"       "f" "$(qs <<<"select prosecdef from pg_proc where proname='chapter_prep_status';")"
# The private helper is executable by signed-in users (the public function
# runs as them and calls it); what keeps it out of reach is that the API only
# exposes its configured schemas (public, graphql_public). Checked separately
# against the Data API.

echo "== 7. rollback restores 2100 exactly; nothing else to undo"
rb=$(sed -n '/^-- ROLLBACK/,$p' supabase/migrations/2120_chapter_privacy.sql | grep '^-- ' | sed 's/^-- //' | grep -v '^ROLLBACK\|^---')
out=$(printf "%s\n" "$rb" | qs); check "rollback applies" "" "$out"
check "after rollback: 2100's behavior (S2 reads S1's status)" "transcribing|true|false" "$(status $S2 s2@x priv-s1)"
check "after rollback: chapters, policies and grants still identical" "$BEFORE" "$(snapshot)"
check "after rollback: private schema and can_see_video gone" "0|0" "$(qs <<<"select (select count(*) from pg_namespace where nspname='private')||'|'||(select count(*) from pg_proc where proname='can_see_video');")"
out=$(qs < supabase/migrations/2120_chapter_privacy.sql); check "2120 re-applies after rollback" "" "$out"
check "and protects again"                                "" "$(status $S2 s2@x priv-s1)"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
