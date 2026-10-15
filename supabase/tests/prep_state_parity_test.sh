#!/usr/bin/env bash
# Every combination of preparation state (status × error kind × attempts ×
# lease) in a throwaway PostgreSQL 17 (Docker): the database's own answer
# (chapter_prep_status, migration 2100) must match how the app classifies it
# (lib/chapterPrepStatus cardPrep) and the server's guard
# (prepareChapter/access stoppedForUsers): active, recoverable or stopped.
# Never touches Supabase, no paid calls.
#
#   bash supabase/tests/prep_state_parity_test.sh
set -u
cd "$(dirname "$0")/../.."
NAME=prep-parity-test
docker rm -f $NAME >/dev/null 2>&1
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=x postgres:17-alpine >/dev/null || exit 1
trap 'docker rm -f $NAME >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do docker exec $NAME pg_isready -U postgres -q && break; sleep 1; done
sleep 2
qs() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" $NAME psql -U postgres -qtAX -v ON_ERROR_STOP=1 2>&1; }

qs >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create function public.is_platform_admin() returns boolean language sql as $$ select false $$;
SQL
qs < supabase/migrations/1900_chapter_content.sql >/dev/null || exit 1
qs < supabase/migrations/2100_chapter_prep.sql >/dev/null || exit 1

OUT=$(mktemp)
qs > "$OUT" <<'SQL'
insert into chapter_prep (video_id, language, status, attempts, error_kind, locked_until)
select format('v-%s-%s-%s-%s', st, coalesce(k, 'none'), a, l), 'hebrew', st, a, k,
       case l when 'held' then now() + interval '2 minutes' when 'expired' then now() - interval '2 minutes' else null end
from unnest(array['queued','transcribing','translating','publishing','ready','failed','blocked','pending_recovery']) st,
     unnest(array[null,'rate_limit','overloaded','timeout','lease_lost','incomplete','unknown','transcription','segmentation','credit','auth','billing']) k,
     unnest(array[1,4,5]) a,
     unnest(array['none','held','expired']) l
-- 'ready' with a held lease can't happen: publishing clears the lease in the
-- same statement (chapter_prep_publish).
where not (st = 'ready' and l = 'held');
select json_agg(json_build_object(
  'status', cp.status, 'attempts', cp.attempts, 'error_kind', cp.error_kind,
  'locked_until', to_char(cp.locked_until at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'sql', (select row_to_json(s) from chapter_prep_status(cp.video_id) s)))
from chapter_prep cp;
SQL

DENO_NO_PACKAGE_JSON=1 deno run --no-lock --allow-read - "$OUT" <<'TS'
import { cardPrep } from "./lib/chapterPrepStatus.ts";
import { stoppedForUsers } from "./supabase/functions/prepareChapter/access.ts";
const rows = JSON.parse(Deno.readTextFileSync(Deno.args[0]));
let ok = 0, bad = 0;
const now = Date.now();
for (const r of rows) {
  const s = r.sql; // { status, busy, resumable }
  const kind = s.busy ? "active" : s.status === "ready" ? "ready" : s.resumable ? "recoverable" : "stopped";
  const card = cardPrep(false, s);
  const cardKind = s.status === "ready" ? "ready"
    : card.state === "preparing" && !card.autoResume ? "active"
    : (card.state === "preparing" && card.autoResume) || card.retry ? "recoverable"
    : "stopped";
  const guard = stoppedForUsers(r, now) ? "stopped" : "not-stopped";
  const guardOk = (kind === "stopped") === (guard === "stopped");
  if (cardKind === kind && guardOk) ok++;
  else { bad++; if (bad <= 10) console.log("  MISMATCH", JSON.stringify(r), { kind, cardKind, guard }); }
}
const counts: Record<string, number> = {};
for (const r of rows) { const s = r.sql; const k = s.busy ? "active" : s.status === "ready" ? "ready" : s.resumable ? "recoverable" : "stopped"; counts[k] = (counts[k] || 0) + 1; }
console.log(`  combinations: ${rows.length}  ${JSON.stringify(counts)}`);
console.log(`passed: ${ok}  failed: ${bad}`);
if (bad) Deno.exit(1);
TS
