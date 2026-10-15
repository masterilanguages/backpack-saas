#!/usr/bin/env bash
# Runs the staged prepareChapter tests (fake providers, no paid calls) against
# the real SQL functions of migration 2100 in a throwaway local PostgreSQL 17.
#
#   bash supabase/tests/prepare_pipeline_test.sh
set -u
cd "$(dirname "$0")/../.."
NAME=prepare-pipeline-test
PORT=55432
docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=x -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null || exit 1
trap 'docker rm -f $NAME >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do docker exec $NAME pg_isready -U postgres -q && break; sleep 1; done
sleep 2
q() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1; }
q <<'SQL' || exit 1
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- A platform admin in tests: a session with test.admin = on.
create function public.is_platform_admin() returns boolean language sql as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
-- Same default privileges as production (pg_default_acl, checked 2026-10-14):
-- every new table and function in public is granted to anon/authenticated.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
SQL
q < supabase/migrations/1900_chapter_content.sql || exit 1
q < supabase/migrations/2100_chapter_prep.sql || exit 1
q < supabase/migrations/2110_chapter_content_server_writes.sql || exit 1
q < supabase/migrations/2121_chapter_publish_glosses.sql || exit 1

TEST_DATABASE_URL="postgres://postgres:x@127.0.0.1:$PORT/postgres" DENO_NO_PACKAGE_JSON=1 \
  deno test --no-lock --node-modules-dir=none -A supabase/functions/prepareChapter/pipeline.test.ts
