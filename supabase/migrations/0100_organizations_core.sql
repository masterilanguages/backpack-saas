-- ============================================================
-- 0100_organizations_core
-- ============================================================
-- TENANCY layer — rebuild FAITHFUL TO THE WORD ("Arquitectura-Backpack.md").
--
-- OFFICIAL MIGRATION ORDER: 001 -> 0100 -> 0300 -> 0200 -> 0500 -> 0400
--   001  initial_schema        (schools + 49 live tables, portal helpers)
--   0100 organizations_core     <-- THIS FILE: tenancy rename + canonical helpers
--   0300 learning_org_id        (adds org_id axis to the 34 learning tables)
--   0200 link_identity          (census: 8 users -> memberships from app_metadata)
--   0500 subscriptions          (Stripe billing; uses is_platform_admin())
--   0400 rls_reconcile          (final two-axis RLS; USES 0100 helpers as-is)
--
-- WHAT THIS DOES (low risk: the backpack admin tables are EMPTY):
--   1. RENAME  schools          -> organizations
--   2. RENAME  school_users     -> memberships
--   3. RENAME  school_id        -> org_id     on the 12 child tables
--   4. memberships.role: TEXT + CHECK (owner|admin|coach|student),
--      keep UNIQUE(org_id, user_id)
--   5. NEW     platform_admins(user_id uuid pk -> auth.users)
--   6. CANONICAL HELPERS (all STABLE SECURITY DEFINER, search_path = public, pg_temp):
--        my_org_ids()            setof uuid  -- ALL active orgs of the user.
--                                            -- THE tenant axis: RLS isolation uses
--                                            -- `org_id = ANY(select my_org_ids())`.
--        my_org_id()             uuid        -- active/primary org. CONVENIENCE for
--                                            -- default STAMPING ONLY. NEVER use for
--                                            -- RLS isolation (single-org leak).
--        has_org_role(uuid,text) boolean     -- 2-arg canonical (org, min-role).
--        is_platform_admin()     boolean     -- platform super-admin.
--      -> these REPLACE my_school_id(); dependent RLS policies are re-pointed.
--   7. RPC  resolve_org_by_slug(p_slug text) RETURNS organizations
--           (STABLE SECURITY DEFINER) -- tenant lookup for the middleware.
--   8. Masteri seed survives the rename as 1 row in organizations (no re-insert).
--
-- NOT TOUCHED: app_role() / app_email() / created_by (the live portal depends on
-- them; client is ANON + RLS). The 34 "learning" tables get their org_id axis in
-- 0300 (per the official order above).
--
-- Idempotent where Postgres allows; objects that cannot be guarded by
-- IF (NOT) EXISTS are wrapped in DO-blocks that check the catalog first.
-- DOWN-migration (inverse renames) is at the bottom, commented out.
--
-- ------------------------------------------------------------
-- ADVERSARIAL REVIEW NOTES (2026-06-24, validated vs Postgres 16)
-- ------------------------------------------------------------
--  * Every tenancy policy below now carries an EXPLICIT `with check`
--    that mirrors its `using` clause. Postgres would otherwise reuse
--    `using` as the implicit insert/update check, but relying on that
--    is fragile: the moment a future edit adds an OR <read-only> term
--    to `using`, the implicit check would silently allow cross-tenant
--    INSERT/UPDATE. Explicit `with check` is the project standard
--    (see 0400_rls_reconcile: "with_check OBLIGATORIO en todas").
--    Verified: cross-tenant INSERT and UPDATE-repoint are both blocked.
--
--  * CROSS-FILE CONTRACT — this file is the SINGLE SOURCE OF TRUTH for the
--    tenancy helpers. 0400_rls_reconcile.sql USES them verbatim and does NOT
--    redefine them: it does NOT redefine my_org_id() to single-org, and it
--    does NOT create a 1-arg has_org_role(text) overload — it consumes the
--    canonical has_org_role(uuid,text) shipped here. 0500_subscriptions also
--    depends on is_platform_admin() from this file. 0400 then rewrites the
--    organizations/memberships/child-table policies to the final two-axis
--    (org_id + owner/role) model; those policies win once 0400 lands, but
--    this file stays self-contained so it can stand alone if 0400 is not yet
--    applied. Do NOT delete my_org_ids() / has_org_role(uuid,text) /
--    is_platform_admin(): removing them breaks this file's own policies and
--    every downstream caller (0400, 0500) that targets these exact signatures.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. RENAME  schools -> organizations
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'schools')
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'organizations') then
    alter table public.schools rename to organizations;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. RENAME  school_users -> memberships
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'school_users')
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'memberships') then
    alter table public.school_users rename to memberships;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. RENAME  school_id -> org_id  on the 12 child tables
--    (column rename preserves FK + unique constraints automatically)
-- ------------------------------------------------------------
do $$
declare
  t text;
  child_tables text[] := array[
    'calendar_events','files','leads','lessons','notes','memberships',
    'students','tasks','team_members','transactions','vocabulary','vocabulary_progress'
  ];
begin
  foreach t in array child_tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'school_id'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'org_id'
    ) then
      execute format('alter table public.%I rename column school_id to org_id;', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. memberships.role -> TEXT + CHECK (owner|admin|coach|student)
--    Keep UNIQUE(org_id, user_id). Table is EMPTY so the CHECK is safe.
--    Default left as 'admin' (existing behavior); the Stripe alta flow
--    explicitly inserts role='student'. Change here if you prefer a
--    different default.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.memberships'::regclass
      and conname  = 'memberships_role_check'
  ) then
    alter table public.memberships
      add constraint memberships_role_check
      check (role in ('owner','admin','coach','student'));
  end if;
end $$;

-- Ensure UNIQUE(org_id, user_id) exists under a stable name.
-- (The original unique(school_id,user_id) survives the column rename; this
--  block only adds it if, for any reason, it is absent.)
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute a1 on a1.attrelid = con.conrelid and a1.attnum = con.conkey[1]
    join pg_attribute a2 on a2.attrelid = con.conrelid and a2.attnum = con.conkey[2]
    where con.conrelid = 'public.memberships'::regclass
      and con.contype = 'u'
      and array[a1.attname, a2.attname]::text[] <@ array['org_id','user_id']::text[]
      and array['org_id','user_id']::text[] <@ array[a1.attname, a2.attname]::text[]
  ) then
    alter table public.memberships
      add constraint memberships_org_id_user_id_key unique (org_id, user_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. platform_admins (super-admin / the Platform layer)
-- ------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- NOTE: the SELECT policy for platform_admins references is_platform_admin(),
-- which is defined in section 6 below. CREATE POLICY resolves the function at
-- parse time, so the policy is created in section 6b (after the helper exists),
-- NOT here. (Postgres would raise "function ... does not exist" otherwise.)

-- ------------------------------------------------------------
-- 6. HELPERS  (all STABLE SECURITY DEFINER, search_path = public, pg_temp)
--    These replace my_school_id(). Drop the old helper at the end of this
--    section after the policies that used it have been re-pointed.
--
--    CANONICAL TENANT AXIS = my_org_ids() (setof). RLS isolation MUST use
--    `org_id = any(select my_org_ids())`. my_org_id() (singular) is a
--    CONVENIENCE helper for default STAMPING (the user's active/primary org)
--    and MUST NOT be used as the RLS isolation predicate — a multi-org user
--    would otherwise be confined to a single org. Keep this distinction.
-- ------------------------------------------------------------

-- Active/primary org for the current user (first membership by created_at).
-- CONVENIENCE for default STAMPING ONLY (e.g. defaulting org_id on insert).
-- NEVER use this for RLS isolation — use my_org_ids() (setof) for that.
-- Replaces my_school_id().
create or replace function public.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;
$$;

-- All orgs the current user belongs to (supports multi-org memberships).
create or replace function public.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = auth.uid();
$$;

-- True if the current user is a platform-level super admin.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

-- platform_admins SELECT policy (defined here, after is_platform_admin()):
--   * A user may always read their OWN row (cheap "am I a platform admin?"
--     check from the client).
--   * A platform admin may read the FULL roster.
-- WRITES (insert/update/delete) are intentionally NOT exposed to anon/
-- authenticated. Granting/revoking platform-admin status is a privileged,
-- out-of-band operation performed by service_role / superuser (which bypass
-- RLS). With RLS enabled and NO write policy, no end-user role can self-
-- escalate into platform_admins -- which is exactly the desired default.
drop policy if exists "platform_admins: self read"          on public.platform_admins;
drop policy if exists "platform_admins: self or admin read" on public.platform_admins;
create policy "platform_admins: self or admin read" on public.platform_admins
  for select using (user_id = auth.uid() or public.is_platform_admin());

-- True if the current user has AT LEAST p_min role in org p_org.
-- Role hierarchy: owner(4) > admin(3) > coach(2) > student(1).
-- Platform admins always pass.
create or replace function public.has_org_role(p_org uuid, p_min text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.memberships m
      where m.user_id = auth.uid()
        and m.org_id  = p_org
        and (case m.role
               when 'owner'   then 4
               when 'admin'   then 3
               when 'coach'   then 2
               when 'student' then 1
               else 0
             end)
            >=
            (case p_min
               when 'owner'   then 4
               when 'admin'   then 3
               when 'coach'   then 2
               when 'student' then 1
               else 0
             end)
    );
$$;

-- ------------------------------------------------------------
-- 6c. RPC for the middleware: resolve an org row by its public slug.
--     The middleware maps an incoming slug (e.g. "masteri") to the tenant
--     row BEFORE any membership exists (anon, pre-auth), so this lookup must
--     bypass the organizations RLS policy. SECURITY DEFINER does that while
--     exposing ONLY a single by-slug lookup (no table-wide scan to clients).
--     RETURNS the whole organizations row (id, slug, name, active, ...); the
--     caller reads id/slug/name/active. STABLE: no writes; result depends only
--     on table state. Pinned search_path = public, pg_temp.
-- ------------------------------------------------------------
create or replace function public.resolve_org_by_slug(p_slug text)
returns public.organizations
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.*
  from public.organizations o
  where o.slug = p_slug
  limit 1;
$$;

-- Expose the lookup to the (anon + authenticated) client roles. The function
-- body is SECURITY DEFINER and constrained to a single by-slug row, so this
-- does not widen access to the organizations table itself.
grant execute on function public.resolve_org_by_slug(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6b. Re-point RLS policies that referenced my_school_id() / school_id.
--     The original policies (from 001_initial_schema) used
--     `school_id = public.my_school_id()`. After the column + helper rename
--     those policies are now stale (they reference a dropped function).
--     We DROP and RECREATE them against `org_id = public.my_org_id()`,
--     plus a platform-admin escape hatch.
-- ------------------------------------------------------------

-- organizations: user can only see their own org (renamed from "school: own").
-- EXPLICIT with_check: a user may not create/move an organizations row to an
-- org they do not belong to (platform admins excepted).
drop policy if exists "school: own" on public.organizations;
drop policy if exists "org: own"    on public.organizations;
create policy "org: own" on public.organizations
  for all
  using      (id = any (array(select public.my_org_ids())) or public.is_platform_admin())
  with check (id = any (array(select public.my_org_ids())) or public.is_platform_admin());

-- memberships: user can see members of their org(s).
-- EXPLICIT with_check blocks inserting/repointing a membership into a foreign
-- org (platform admins excepted). NOTE: 0400_rls_reconcile later tightens this
-- so only org admins/owners can WRITE memberships; here we keep parity with the
-- original 001 "own school" semantics plus the explicit check.
drop policy if exists "school_users: own school" on public.memberships;
drop policy if exists "memberships: own org"      on public.memberships;
create policy "memberships: own org" on public.memberships
  for all
  using      (org_id = any (array(select public.my_org_ids())) or public.is_platform_admin())
  with check (org_id = any (array(select public.my_org_ids())) or public.is_platform_admin());

-- The 11 remaining child tables: drop old "<x>: own school" policies and
-- recreate against org_id = my_org_ids() (+ platform admin).
-- EXPLICIT with_check mirrors using: blocks cross-tenant INSERT and blocks
-- UPDATE-repointing a row into a foreign org. (Without it, Postgres reuses
-- `using` as the check implicitly -- correct today, but fragile if `using`
-- ever gains an OR <read-only catalog> term. Be explicit. See header note.)
do $$
declare
  rec record;
  child_tables text[] := array[
    'students','leads','vocabulary','vocabulary_progress','lessons','tasks',
    'transactions','team_members','notes','files','calendar_events'
  ];
  t text;
  tenant_pred text;
begin
  tenant_pred := 'org_id = any (array(select public.my_org_ids())) or public.is_platform_admin()';
  -- Drop every existing policy on each child table (names varied in 001).
  foreach t in array child_tables loop
    for rec in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', rec.policyname, t);
    end loop;
    -- Recreate the canonical own-org policy. Uses my_org_ids() so a user
    -- who belongs to several orgs sees the data of each (multi-org safe).
    execute format(
      'create policy %I on public.%I for all using (%s) with check (%s);',
      t || ': own org', t, tenant_pred, tenant_pred
    );
  end loop;
end $$;

-- Now it is safe to drop the obsolete helper.
drop function if exists public.my_school_id();

commit;

-- ============================================================
-- DOWN MIGRATION (rollback) — run manually if you must revert.
-- Inverse of everything above. Commented out on purpose.
-- ============================================================
-- begin;
--
-- -- 6b-down. Restore my_school_id() helper.
-- --          NOTE: the ORIGINAL 001 definition lacked `set search_path`,
-- --          which the audit flagged as a defect. We restore it WITH a pinned
-- --          search_path on rollback -- harmless (same result set) and avoids
-- --          reintroducing the search-path-hijack surface on a revert.
-- create or replace function public.my_school_id()
-- returns uuid language sql stable security definer
-- set search_path = public, pg_temp as $$
--   select org_id from public.memberships
--   where user_id = auth.uid()
--   limit 1;
-- $$;
--
-- -- 6b-down. Restore original child-table policies (org_id col still exists
-- --          at this point; we recreate the "<x>: own school" names but on
-- --          org_id, then the column rename below flips them back to school_id
-- --          semantics). Drop the org-era policies first.
-- do $$
-- declare
--   rec record;
--   child_tables text[] := array[
--     'students','leads','vocabulary','vocabulary_progress','lessons','tasks',
--     'transactions','team_members','notes','files','calendar_events'
--   ];
--   t text;
-- begin
--   foreach t in array child_tables loop
--     for rec in select policyname from pg_policies
--                where schemaname='public' and tablename=t loop
--       execute format('drop policy if exists %I on public.%I;', rec.policyname, t);
--     end loop;
--   end loop;
-- end $$;
--
-- drop policy if exists "org: own"            on public.organizations;
-- drop policy if exists "memberships: own org" on public.memberships;
--
-- -- 5-down. Drop platform layer.
-- drop policy if exists "platform_admins: self or admin read" on public.platform_admins;
-- drop policy if exists "platform_admins: self read"          on public.platform_admins;
-- drop table if exists public.platform_admins;
--
-- -- 6-down. Drop new helpers.
-- drop function if exists public.resolve_org_by_slug(text);
-- drop function if exists public.has_org_role(uuid, text);
-- drop function if exists public.is_platform_admin();
-- drop function if exists public.my_org_ids();
-- drop function if exists public.my_org_id();
--
-- -- 4-down. Remove CHECK + (added) unique on role/keys.
-- alter table public.memberships drop constraint if exists memberships_role_check;
-- -- (leave memberships_org_id_user_id_key; it maps to the original unique)
--
-- -- 3-down. RENAME org_id -> school_id back on the 12 child tables.
-- do $$
-- declare
--   t text;
--   child_tables text[] := array[
--     'calendar_events','files','leads','lessons','notes','memberships',
--     'students','tasks','team_members','transactions','vocabulary','vocabulary_progress'
--   ];
-- begin
--   foreach t in array child_tables loop
--     if exists (select 1 from information_schema.columns
--                where table_schema='public' and table_name=t and column_name='org_id') then
--       execute format('alter table public.%I rename column org_id to school_id;', t);
--     end if;
--   end loop;
-- end $$;
--
-- -- 2-down. RENAME memberships -> school_users.
-- alter table public.memberships rename to school_users;
--
-- -- 1-down. RENAME organizations -> schools.
-- alter table public.organizations rename to schools;
--
-- -- Restore original child-table policies on the now-school_id columns.
-- create policy "students: own school"       on public.students            for all using (school_id = public.my_school_id());
-- create policy "leads: own school"          on public.leads               for all using (school_id = public.my_school_id());
-- create policy "vocabulary: own school"     on public.vocabulary          for all using (school_id = public.my_school_id());
-- create policy "vocab_progress: own school" on public.vocabulary_progress for all using (school_id = public.my_school_id());
-- create policy "lessons: own school"        on public.lessons             for all using (school_id = public.my_school_id());
-- create policy "tasks: own school"          on public.tasks               for all using (school_id = public.my_school_id());
-- create policy "transactions: own school"   on public.transactions        for all using (school_id = public.my_school_id());
-- create policy "team: own school"           on public.team_members        for all using (school_id = public.my_school_id());
-- create policy "notes: own school"          on public.notes               for all using (school_id = public.my_school_id());
-- create policy "files: own school"          on public.files               for all using (school_id = public.my_school_id());
-- create policy "calendar: own school"       on public.calendar_events     for all using (school_id = public.my_school_id());
-- create policy "school: own"                on public.schools             for all using (id = public.my_school_id());
-- create policy "school_users: own school"   on public.school_users        for all using (school_id = public.my_school_id());
--
-- commit;
