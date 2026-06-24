-- ============================================================================
-- 0400_rls_reconcile.sql   (MULTI-ORG, CANONICAL-CONTRACT)
-- ============================================================================
-- OBJETIVO
--   Reconciliar RLS hacia DOS EJES: (1) tenant MULTI-ORG (memberships del user),
--   (2) dueno/rol de fila, SIN romper el portal vivo (cliente ANON + helpers
--   app_email()/app_role() + ownership por created_by(email)).
--
-- ORDEN OFICIAL DE APLICACION: 001 -> 0100 -> 0300 -> 0200 -> 0500 -> 0400.
--   Este 0400 es el ULTIMO en RLS y asume que org_id ya existe en las learning
--   (anadido por 0300). Si se aplica antes de 0300, las ramas de tenant caen a
--   TRUE (no-op) y solo aplica el eje dueno/rol — no rompe, pero no aisla por
--   tenant hasta re-correrlo tras 0300.
--
-- ----------------------------------------------------------------------------
-- CONTRATO CANONICO QUE IMPLEMENTA ESTE ARCHIVO
-- ----------------------------------------------------------------------------
--   [MULTI-ORG] El eje tenant se deriva de las MEMBERSHIPS del usuario. El
--           aislamiento RLS usa SIEMPRE `org_id = ANY(select my_org_ids())`
--           (todas las orgs activas del user), NUNCA my_org_id() single-org.
--           my_org_id() existe SOLO como conveniencia para el STAMPING por
--           defecto (lo usan los triggers de 0300), jamas para aislar lecturas.
--           Este 0400 NO redefine my_org_id() / my_org_ids() / has_org_role /
--           is_platform_admin(): los USA tal cual los definio 0100.
--
--   [has_org_role 2-arg] has_org_role(p_org uuid, p_min text) (de 0100) es la
--           AUTORIDAD canonica (jerarquia de roles + is_platform_admin()).
--           0500_subscriptions DEPENDE de esa firma. Aqui NO se crea un overload
--           has_org_role(text) de 1-arg; si por una migracion previa existiera,
--           se DROPEA defensivamente al inicio (era ambiguo e ignoraba platform).
--
--   [CATALOGO GLOBAL] Tablas de contenido compartido de plataforma —
--           song, video, day, daily_song, picture_word, story, story_song,
--           singing_song, media_library — exponen SELECT con
--           `(org_id IS NULL OR org_id = ANY(select my_org_ids()))`:
--           org_id NULL = contenido global de plataforma visible para todos;
--           org_id no-NULL = solo miembros de esa org. La ESCRITURA de catalogo
--           se restringe a admin/owner de la org (o platform admin); ni dueno
--           por created_by ni coach ni "approved" conceden escritura de catalogo.
--
--   [CERRAR using(true)] Toda policy permisiva vieja sin filtro de org
--           (word_sel = using(true) y similares) se BARRE en el paso 1 y se
--           reemplaza por la version scopeada por org + dueno/rol/approved.
--
--   [with_check OBLIGATORIO] TODA policy de escritura (FOR ALL / INSERT /
--           UPDATE) lleva `with check` explicito que refleja su `using`.
--
--   [helpers vivos INTACTOS] app_role()/app_email()/created_by NO se tocan
--           (el portal vivo depende de ellos: cliente ANON + RLS). Solo se crea
--           el helper NUEVO coach_of_email(text), que aisla por my_org_ids().
--
-- ----------------------------------------------------------------------------
-- DECISIONES DE LA REVISION (vs. el borrador single-org previo)
-- ----------------------------------------------------------------------------
--   [FIX-A] (CRITICO) NO se re-crea has_org_role(text). 0100 ya definio la
--           AUTORIDAD has_org_role(uuid,text) y 0500 depende de ella. Aqui se
--           USA has_org_role(org_id, 'admin') por org concreta; el overload de
--           1-arg se elimina si existiera.
--
--   [FIX-B] (CRITICO, MAXIMO RIESGO PROD) NO se hace create-or-replace de
--           app_role()/app_email()/my_org_id()/my_org_ids(). Sus cuerpos quedan
--           INTACTOS; aqui solo se ASERTA que existen y se aborta con mensaje
--           claro si faltan. Solo se crea el helper NUEVO coach_of_email(text).
--
--   [FIX-C] (CRITICO, FUGA CROSS-TENANT) El barrido del paso 1 elimina TODAS las
--           policies permisivas viejas de las tablas learning (no solo
--           using(true)). Las permisivas se combinan con OR; dejar viva una
--           vieja tipo `_admin using(app_role()='admin')` SIN filtro de org deja
--           que un admin de la org A lea filas de la org B en cuanto entre el
--           segundo tenant. Las nuevas policies multi-org replican
--           owner/admin/coach DENTRO del/los tenant(s), asi que el portal NO
--           pierde acceso.
--
--   [FIX-D] (CRITICO, ESCALADA DE PRIVILEGIO) Se DROPEAN las policies FOR ALL
--           de 0100 ("org: own", "memberships: own org", "<t>: own org") que
--           dejaban a CUALQUIER miembro (incluido student) ESCRIBIR datos de la
--           org, y se reemplazan por SELECT-para-miembros (multi-org) +
--           WRITE-solo-admin/owner via has_org_role(org_id,'admin').
--
--   [FIX-E] (ALTO) coach_assignment: se INTROSPECCIONAN coach_email/student_email
--           antes de referenciarlas; si faltan, se cae a admin-only.
--
--   [FIX-F] (MEDIO) La DOWN-migration NO inventa policies permisivas: solo
--           restaura word_sel (la unica fuga confirmada) y deja nota para el
--           resto desde un volcado real de pg_policies pre-0400.
--
--   [FIX-G] (CRITICO, PLATFORM LOCKOUT) El EJE TENANT incluye is_platform_admin().
--           El predicado de tenant (org_id IS NULL OR org_id = ANY(my_org_ids))
--           se ANDea con el owner_clause. Como el platform admin NO tiene
--           memberships, my_org_ids() es vacio: sin escape de plataforma EN EL
--           EJE TENANT, el super-admin quedaba excluido de TODA fila org-scoped
--           (learning, coach_assignment) aunque is_platform_admin() viviera en el
--           owner_clause. Por eso el tenant_clause ahora es
--           `(org_id IS NULL OR org_id = ANY(select my_org_ids()) OR is_platform_admin())`.
--           Validado en Postgres 16: platform_admin ve TODAS las orgs (test h).
--
-- DEPENDENCIAS (deben existir ANTES de aplicar 0400; se asertan abajo):
--   - 0100_organizations_core: organizations, memberships, my_org_id(),
--       my_org_ids(), has_org_role(uuid,text), is_platform_admin(),
--       platform_admins, resolve_org_by_slug(text).
--   - 0300_learning_org_id: org_id en las 34 learning + coach_assignment,
--       triggers stamp_org_id()/freeze_org_id().
--   - helpers VIVOS app_email()/app_role() (del portal; NO en archivos).
--
-- NO APLICAR AQUI. Se aplica luego sobre una COPIA primero.
-- DOWN-migration (rollback) comentada al final.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. PRECONDICIONES — asertar la AUTORIDAD canonica (de 0100) + los helpers
--    VIVOS del portal (app_email/app_role). NO se redefine ninguno.
--    [FIX-A][FIX-B]
-- ----------------------------------------------------------------------------
do $pre$
begin
  -- Autoridad multi-tenant (0100). Firmas EXACTAS.
  if to_regclass('public.organizations') is null then
    raise exception '0400: falta public.organizations. Aplica 0100_organizations_core primero.';
  end if;
  if to_regclass('public.memberships') is null then
    raise exception '0400: falta public.memberships. Aplica 0100_organizations_core primero.';
  end if;
  -- my_org_id(): conveniencia para STAMPING (triggers de 0300). NO se usa para
  -- aislar lecturas aqui, pero debe existir (la asertamos por consistencia).
  if to_regproc('public.my_org_id') is null then
    raise exception '0400: falta public.my_org_id(). Aplica 0100_organizations_core primero.';
  end if;
  -- my_org_ids(): EJE DE AISLAMIENTO multi-org. Imprescindible.
  if to_regproc('public.my_org_ids') is null then
    raise exception '0400: falta public.my_org_ids() (eje de aislamiento MULTI-ORG). Aplica 0100_organizations_core primero.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='has_org_role'
      and pg_get_function_identity_arguments(p.oid) = 'p_org uuid, p_min text'
  ) then
    raise exception
      '0400: falta public.has_org_role(uuid, text) (autoridad canonica de 0100). '
      'NO se debe usar/crear una variante has_org_role(text).';
  end if;
  if to_regproc('public.is_platform_admin') is null then
    raise exception '0400: falta public.is_platform_admin(). Aplica 0100_organizations_core primero.';
  end if;

  -- Helpers VIVOS del portal: NO los reescribimos. Solo exigimos que existan.
  if to_regproc('public.app_email') is null then
    raise exception
      '0400: falta public.app_email() (helper VIVO del portal). NO la crees a ciegas: '
      'captura su cuerpo real del proyecto vivo antes de continuar.';
  end if;
  if to_regproc('public.app_role') is null then
    raise exception
      '0400: falta public.app_role() (helper VIVO del portal). NO la crees a ciegas: '
      'captura su cuerpo real del proyecto vivo antes de continuar.';
  end if;
end
$pre$;

-- ----------------------------------------------------------------------------
-- 0a. ELIMINAR el overload erroneo has_org_role(text) de 1-arg si existiera.
--     La AUTORIDAD canonica es has_org_role(uuid,text) (0100). Un overload de
--     1-arg era ambiguo (no recibe org), ignoraba platform_admins y divergia de
--     la unica fuente de verdad. Se dropea de forma idempotente. [FIX-A]
-- ----------------------------------------------------------------------------
drop function if exists public.has_org_role(text);

-- ----------------------------------------------------------------------------
-- 0b. UNICO helper NUEVO: coach_of_email(p_email).
--     true si el usuario actual es coach asignado al alumno p_email, DENTRO de
--     alguna de SUS orgs (MULTI-ORG: aisla por my_org_ids(), no por my_org_id()).
--     Centraliza el patron coach<->alumno. SECURITY DEFINER, search_path fijo.
--     Se construye DEFENSIVO: si coach_assignment no tiene las columnas esperadas
--     (vienen del esquema vivo, no de archivos), la funcion devuelve false en vez
--     de fallar. [FIX-E]
-- ----------------------------------------------------------------------------
do $mk$
declare
  has_cols boolean;
begin
  select
    exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='coach_assignment' and column_name='coach_email')
    and exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='coach_assignment' and column_name='student_email')
  into has_cols;

  if has_cols then
    execute $body$
      create or replace function public.coach_of_email(p_email text)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $f$
        select exists (
          select 1
          from public.coach_assignment ca
          where ca.coach_email = public.app_email()
            and ca.student_email = p_email
            and (ca.org_id is null or ca.org_id = any (select public.my_org_ids()))
        );
      $f$;
    $body$;
  else
    -- Sin las columnas esperadas: helper inocuo (nunca concede coach-access).
    execute $body$
      create or replace function public.coach_of_email(p_email text)
      returns boolean
      language sql
      immutable
      as $f$ select false $f$;
    $body$;
    raise warning '0400: coach_assignment no tiene coach_email/student_email; coach_of_email() = false (sin coach-access).';
  end if;
end
$mk$;

-- ----------------------------------------------------------------------------
-- 1. CERRAR FUGAS — barrido AMPLIO. Para CADA tabla learning (+coach_assignment
--    + huerfanas sensibles) se eliminan TODAS sus policies preexistentes que NO
--    sean las nuevas *_org_* que este 0400 va a crear. Razon [FIX-C]: las
--    policies permisivas se combinan con OR; dejar viva CUALQUIER policy vieja
--    sin filtro de org (using(true) como word_sel, o created_by-only, o
--    app_role()='admin'-only) permite leer/escribir filas de OTRO tenant en
--    cuanto entre el segundo. Las nuevas policies multi-org replican
--    owner/admin/coach DENTRO del/los tenant(s), asi que el portal NO pierde
--    acceso. Se respetan/saltan las nuevas *_org_* por si el archivo se re-corre.
-- ----------------------------------------------------------------------------
do $sweep$
declare
  r record;
  scoped_tables text[] := array[
    -- 34 learning + coach_assignment + huerfanas sensibles
    'achievement','activity_progress','chat_message','coach_assignment',
    'coach_note','conversation_session','daily_song','day','day_progress',
    'fluent_lead','journal_entry','lesson_progress','media_library',
    'picture_word','practice_result','singing_progress','singing_recording',
    'singing_segment','singing_song','song','song_progress','story',
    'story_song','study_session','text_edit','todo_item','todo_progress',
    'user_coins','user_profile','user_program','user_story_progress',
    'video','vocab_exposure','word',
    'assessment_leads','youtube_oauth_tokens'
  ];
begin
  for r in
    select pol.tablename, pol.policyname
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.tablename = any (scoped_tables)
      -- no borrar las nuevas (idempotencia si se re-ejecuta el archivo)
      and pol.policyname not like '%\_org\_select' escape '\'
      and pol.policyname not like '%\_org\_write'  escape '\'
      and pol.policyname not in (
        'coach_assignment_org_select','coach_assignment_org_write',
        'assessment_leads_admin_select','assessment_leads_insert',
        'assessment_leads_admin_modify','assessment_leads_admin_delete',
        'youtube_oauth_tokens_admin_all'
      )
  loop
    raise notice '0400: dropping legacy policy %.%', r.tablename, r.policyname;
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$sweep$;

-- ----------------------------------------------------------------------------
-- 2. LEARNING — reescritura a DOS EJES (org_id MULTI-ORG + dueno/rol).
--    Por cada una de las 34 tablas se introspecciona created_by / approved /
--    org_id y se emiten dos policies idempotentes (SELECT + ALL con with_check).
--
--    EJE TENANT (MULTI-ORG):  org_id = ANY(select my_org_ids())
--      -> aisla por TODAS las orgs activas del user, no por una sola.
--
--    CATALOGO GLOBAL (song, video, day, daily_song, picture_word, story,
--      story_song, singing_song, media_library):
--        SELECT using ( org_id IS NULL OR org_id = ANY(select my_org_ids()) )
--          -> el contenido global de plataforma (org_id NULL) es visible para
--             todos; el de una org, solo para sus miembros.
--        WRITE  using/with check ( admin/owner de la org O platform admin )
--          -> escritura de catalogo restringida; created_by/coach/approved NO
--             conceden escritura de catalogo.
--
--    RESTO DE LEARNING (datos de alumno):
--        Predicado (SELECT y WRITE, con with_check):
--          ( org_id IS NULL OR org_id = ANY(select my_org_ids()) )         -- tenant multi-org
--          AND
--          ( app_role()='admin'                                           -- admin JWT (portal)
--            OR has_org_role(org_id,'admin')                              -- admin/owner via membership (+platform)
--            [OR created_by = app_email() OR coach_of_email(created_by)]   -- dueno / coach
--            [OR approved = true] )                                        -- contenido aprobado
--
--    Tenant NULL-tolerant durante la transicion (tras backfill+NOTNULL el eje
--    se vuelve estricto sin tocar policies). with_check SIEMPRE.
--    [FIX-A] usa has_org_role(uuid,text) por org concreta (org_id), NO un
--    overload de 1 arg ni my_org_id() single-org.
-- ----------------------------------------------------------------------------
do $learn$
declare
  t             text;
  has_created   boolean;
  has_approved  boolean;
  has_orgid     boolean;
  is_catalog    boolean;
  tenant_clause text;
  owner_clause  text;
  full_clause   text;
  write_clause  text;
  -- Tablas de CATALOGO GLOBAL: contenido compartido de plataforma.
  catalog_tables text[] := array[
    'song','video','day','daily_song','picture_word','story','story_song',
    'singing_song','media_library'
  ];
  learning_tables text[] := array[
    'achievement','activity_progress','chat_message','coach_note',
    'conversation_session','daily_song','day','day_progress','fluent_lead',
    'journal_entry','lesson_progress','media_library','picture_word',
    'practice_result','singing_progress','singing_recording','singing_segment',
    'singing_song','song','song_progress','story','story_song','study_session',
    'text_edit','todo_item','todo_progress','user_coins','user_profile',
    'user_program','user_story_progress','video','vocab_exposure','word'
  ];
begin
  foreach t in array learning_tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise warning '0400: tabla public.% no existe, se omite.', t;
      continue;
    end if;

    select exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='org_id')
      into has_orgid;
    select exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='created_by')
      into has_created;
    select exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='approved')
      into has_approved;

    is_catalog := t = any (catalog_tables);

    -- EJE TENANT — MULTI-ORG. El contenido global (org_id NULL) es visible/
    -- escribible-segun-rol en ambos casos; el resto, solo dentro de las orgs
    -- del user. Si 0300 aun no anadio org_id, el eje cae a TRUE (no-op).
    -- PLATFORM ESCAPE: is_platform_admin() se incluye DENTRO del eje tenant para
    -- que el super-admin de plataforma NO quede excluido por org (el eje tenant
    -- se ANDea con el owner_clause; sin este escape, my_org_ids() vacio dejaria
    -- al platform admin sin ver NINGUNA fila org-scoped — viola "platform ve todo").
    if has_orgid then
      tenant_clause := '(org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())';
    else
      tenant_clause := 'true';   -- 0300 no aplicado aun: eje tenant no-op (no rompe)
    end if;

    -- admin/owner de la org SIEMPRE (dos vias: claim del portal + membership
    -- canonica por org concreta). has_org_role(org_id,'admin') incluye el
    -- escape de plataforma. Si la fila no tiene org_id (catalogo global), se usa
    -- el escape de plataforma + el claim de admin del portal.
    if has_orgid then
      owner_clause := 'public.app_role() = ''admin'''
                   || ' or public.has_org_role(org_id, ''admin'')'
                   || ' or public.is_platform_admin()';
    else
      owner_clause := 'public.app_role() = ''admin'''
                   || ' or public.is_platform_admin()';
    end if;

    if is_catalog then
      -- CATALOGO GLOBAL.
      --   SELECT: cualquier miembro de la org (o todos, si org_id NULL).
      --   WRITE : solo admin/owner DE LA ORG dueña (has_org_role(org_id,'admin'))
      --           o PLATFORM admin. [FIX-CATALOG-WRITE]
      --
      -- AGUJERO CERRADO (HIGH, cross-tenant write del catalogo GLOBAL):
      --   El owner_clause generico incluye `app_role()='admin'` (claim de
      --   app_metadata del portal, NO ligado a ninguna org y NO platform). En el
      --   eje tenant del catalogo, `org_id IS NULL` (fila GLOBAL de plataforma)
      --   es TRUE para todos; combinado con `app_role()='admin'` eso dejaba que
      --   CUALQUIER admin de una org (por el censo, todo owner lleva
      --   app_metadata.role='admin') hiciera INSERT/UPDATE/DELETE de filas
      --   GLOBALES del catalogo (song/video/day/...), envenenando el contenido
      --   compartido que ven TODOS los tenants. El contrato exige: escritura de
      --   catalogo GLOBAL solo PLATFORM; escritura de catalogo DE UNA ORG solo
      --   admin/owner de ESA org. Por eso el catalogo usa un owner_clause SIN el
      --   claim de portal: has_org_role(org_id,'admin') OR is_platform_admin().
      --     - fila global (org_id NULL): has_org_role(NULL,..)=false -> solo platform.
      --     - fila de org:               solo admin/owner de esa org (o platform);
      --       el tenant_clause ya confina a las orgs del user (no cross-org).
      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists %I on public.%I', t || '_org_select', t);
      execute format('create policy %I on public.%I for select using (%s)',
                     t || '_org_select', t, tenant_clause);

      -- owner_clause ESPECIFICO de catalogo: NUNCA el claim de portal
      -- (app_role()='admin') -> evita que un admin de org escriba filas globales.
      write_clause := '(' || tenant_clause || ') and ('
                   || 'public.has_org_role(org_id, ''admin'') or public.is_platform_admin())';
      execute format('drop policy if exists %I on public.%I', t || '_org_write', t);
      execute format('create policy %I on public.%I for all using (%s) with check (%s)',
                     t || '_org_write', t, write_clause, write_clause);
    else
      -- DATOS DE ALUMNO: dos ejes (tenant multi-org + dueno/rol/coach/approved).
      if has_created then
        owner_clause := owner_clause
          || ' or created_by = public.app_email()'
          || ' or public.coach_of_email(created_by)';
      end if;
      if has_approved then
        owner_clause := owner_clause || ' or approved = true';
      end if;

      full_clause := '(' || tenant_clause || ') and (' || owner_clause || ')';

      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists %I on public.%I', t || '_org_select', t);
      execute format('create policy %I on public.%I for select using (%s)',
                     t || '_org_select', t, full_clause);

      execute format('drop policy if exists %I on public.%I', t || '_org_write', t);
      execute format('create policy %I on public.%I for all using (%s) with check (%s)',
                     t || '_org_write', t, full_clause, full_clause);
    end if;
  end loop;
end
$learn$;

-- ----------------------------------------------------------------------------
-- 2b. coach_assignment — el VINCULO coach<->alumno (no es fila "de alumno").
--     Visible/editable por admin/owner de la org, el coach o el alumno del
--     vinculo. Tenant MULTI-ORG, NULL-tolerant. with_check obligatorio.
--     [FIX-E] se introspeccionan coach_email/student_email; si faltan, admin-only.
-- ----------------------------------------------------------------------------
do $ca$
declare
  has_orgid   boolean;
  has_emails  boolean;
  tenant_clause text;
  ident_clause  text;
  clause text;
begin
  if to_regclass('public.coach_assignment') is null then
    raise warning '0400: coach_assignment no existe, se omite.';
    return;
  end if;

  select exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='coach_assignment'
                   and column_name='org_id') into has_orgid;
  select
    exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='coach_assignment' and column_name='coach_email')
    and exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='coach_assignment' and column_name='student_email')
  into has_emails;

  if has_orgid then
    -- PLATFORM ESCAPE dentro del eje tenant (ver nota en el bloque learning):
    -- el super-admin de plataforma no debe quedar excluido por org.
    tenant_clause := '(org_id is null or org_id = any (select public.my_org_ids()) or public.is_platform_admin())';
    ident_clause  := 'public.app_role() = ''admin'''
                  || ' or public.has_org_role(org_id, ''admin'')'
                  || ' or public.is_platform_admin()';
  else
    tenant_clause := 'true';
    ident_clause  := 'public.app_role() = ''admin'''
                  || ' or public.is_platform_admin()';
  end if;

  if has_emails then
    ident_clause := ident_clause
      || ' or coach_email = public.app_email()'
      || ' or student_email = public.app_email()';
  end if;

  clause := '(' || tenant_clause || ') and (' || ident_clause || ')';

  execute 'alter table public.coach_assignment enable row level security';

  execute 'drop policy if exists coach_assignment_org_select on public.coach_assignment';
  execute format(
    'create policy coach_assignment_org_select on public.coach_assignment for select using (%s)',
    clause);

  execute 'drop policy if exists coach_assignment_org_write on public.coach_assignment';
  execute format(
    'create policy coach_assignment_org_write on public.coach_assignment for all using (%s) with check (%s)',
    clause, clause);
end
$ca$;

-- ----------------------------------------------------------------------------
-- 3. BACKPACK (admin) — SELECT para miembros de la org (MULTI-ORG),
--    WRITE solo admin/owner. [FIX-D] Se DROPEAN primero las policies FOR ALL
--    que dejo 0100 ("org: own", "memberships: own org", "<t>: own org"),
--    porque permiten a CUALQUIER miembro (incluido student) escribir datos de
--    la org (escalada). Estas tablas estan VACIAS hoy -> bajo riesgo.
--    with_check obligatorio.
-- ----------------------------------------------------------------------------

-- organizations: ver SOLO la(s) propia(s) (o platform); escribir solo owner/admin.
alter table public.organizations enable row level security;
drop policy if exists "org: own"    on public.organizations;     -- 0100 FOR ALL (escalada)
drop policy if exists "school: own" on public.organizations;

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations
  for select using (
    id = any (select public.my_org_ids())
    or public.is_platform_admin()
  );

drop policy if exists organizations_admin_write on public.organizations;
create policy organizations_admin_write on public.organizations
  for all
  using (public.has_org_role(id, 'admin'))
  with check (public.has_org_role(id, 'admin'));

-- memberships: ver las propias o las de la(s) org(s); gestionar solo admin/owner.
-- (SELECT amplio a miembros evita el bootstrap-deadlock de my_org_ids().)
alter table public.memberships enable row level security;
drop policy if exists "memberships: own org" on public.memberships;  -- 0100 FOR ALL (escalada)
drop policy if exists "school_users: own school" on public.memberships;

drop policy if exists memberships_self_select on public.memberships;
create policy memberships_self_select on public.memberships
  for select using (
    user_id = auth.uid()
    or org_id = any (select public.my_org_ids())
    or public.is_platform_admin()
  );

drop policy if exists memberships_admin_write on public.memberships;
create policy memberships_admin_write on public.memberships
  for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));

-- Resto de tablas backpack (con org_id). SELECT: miembro de la org (MULTI-ORG).
-- WRITE: admin/owner via has_org_role(org_id,'admin'). [FIX-D] drop de las
-- policies FOR ALL de 0100 antes de crear las scopeadas. with_check obligatorio.
do $bk$
declare
  t text;
  has_orgid boolean;
  backpack_tables text[] := array[
    'calendar_events','files','leads','lessons','notes','students','tasks',
    'team_members','transactions','vocabulary','vocabulary_progress'
  ];
begin
  foreach t in array backpack_tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise warning '0400: tabla backpack public.% no existe, se omite.', t;
      continue;
    end if;

    select exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='org_id')
      into has_orgid;
    if not has_orgid then
      raise warning '0400: tabla backpack % sin org_id, se omite.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- [FIX-D] eliminar la policy FOR ALL "<t>: own org" creada por 0100.
    execute format('drop policy if exists %I on public.%I', t || ': own org', t);

    execute format('drop policy if exists %I on public.%I', t || '_org_select', t);
    execute format(
      'create policy %I on public.%I for select using '
      || '(org_id = any (select public.my_org_ids()) or public.is_platform_admin())',
      t || '_org_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_org_write', t);
    execute format(
      'create policy %I on public.%I for all '
      || 'using (public.has_org_role(org_id, ''admin'')) '
      || 'with check (public.has_org_role(org_id, ''admin''))',
      t || '_org_write', t);
  end loop;
end
$bk$;

-- ----------------------------------------------------------------------------
-- 4. HUERFANAS — assessment_leads + youtube_oauth_tokens.
--    Anadir org_id (nullable) + RLS RESTRICTIVA. NUNCA using(true).
-- ----------------------------------------------------------------------------

-- assessment_leads: captura de leads. org_id nullable + FK.
alter table public.assessment_leads
  add column if not exists org_id uuid references public.organizations(id);
alter table public.assessment_leads enable row level security;

-- SELECT/UPDATE/DELETE: solo admin/owner de la org. INSERT: controlado por org_id.
-- (El formulario publico puede insertar con org_id NULL o una de SUS orgs;
--  nunca leer.)
drop policy if exists assessment_leads_admin_select on public.assessment_leads;
create policy assessment_leads_admin_select on public.assessment_leads
  for select using (
    public.is_platform_admin()
    or (org_id is not null and public.has_org_role(org_id, 'admin'))
  );

drop policy if exists assessment_leads_insert on public.assessment_leads;
create policy assessment_leads_insert on public.assessment_leads
  for insert
  with check (org_id is null or org_id = any (select public.my_org_ids()));

drop policy if exists assessment_leads_admin_modify on public.assessment_leads;
create policy assessment_leads_admin_modify on public.assessment_leads
  for update
  using (public.is_platform_admin() or (org_id is not null and public.has_org_role(org_id, 'admin')))
  with check (public.is_platform_admin() or (org_id is not null and public.has_org_role(org_id, 'admin')));

drop policy if exists assessment_leads_admin_delete on public.assessment_leads;
create policy assessment_leads_admin_delete on public.assessment_leads
  for delete
  using (public.is_platform_admin() or (org_id is not null and public.has_org_role(org_id, 'admin')));

-- youtube_oauth_tokens: secretos OAuth. Maxima restriccion: CRUD solo admin/owner
-- de la org dueña (o platform). Si org_id es NULL (sin tenant), SOLO platform.
alter table public.youtube_oauth_tokens
  add column if not exists org_id uuid references public.organizations(id);
alter table public.youtube_oauth_tokens enable row level security;

drop policy if exists youtube_oauth_tokens_admin_all on public.youtube_oauth_tokens;
create policy youtube_oauth_tokens_admin_all on public.youtube_oauth_tokens
  for all
  using (
    public.is_platform_admin()
    or (org_id is not null and public.has_org_role(org_id, 'admin'))
  )
  with check (
    public.is_platform_admin()
    or (org_id is not null and public.has_org_role(org_id, 'admin'))
  );

commit;

-- ============================================================================
-- VERIFICACION POST-MIGRACION (ejecutar manualmente, NO parte del up)
-- ----------------------------------------------------------------------------
-- 1) 0 policies permisivas using(true) en las tablas scopeadas
--    (salvo el SELECT de catalogo global y el INSERT publico intencional):
--   select pol.tablename, pol.policyname
--   from pg_policies pol
--   join pg_class c on c.relname=pol.tablename
--   join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname=pol.schemaname
--   join pg_policy p on p.polname=pol.policyname and p.polrelid=c.oid
--   where pol.schemaname='public'
--     and (p.polqual is null or btrim(lower(pg_get_expr(p.polqual,p.polrelid)))='true');
--   -- Esperado: 0 (los SELECT de catalogo llevan org_id IS NULL OR ... ; no son 'true').
--
-- 2) 0 policies de escritura sin with_check:
--   select pol.tablename, pol.policyname, pol.cmd
--   from pg_policies pol
--   join pg_class c on c.relname=pol.tablename
--   join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname=pol.schemaname
--   join pg_policy p on p.polname=pol.policyname and p.polrelid=c.oid
--   where pol.schemaname='public' and pol.cmd in ('ALL','INSERT','UPDATE')
--     and p.polwithcheck is null;
--   -- Esperado: 0.
--
-- 3) NO debe existir el overload erroneo has_org_role(text):
--   select pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='has_org_role';
--   -- Esperado: solo 'p_org uuid, p_min text'.
--
-- 4) Catalogo global expone org_id NULL en SELECT (no 'true', no my_org_id):
--   select tablename, policyname, qual
--   from pg_policies where schemaname='public'
--     and tablename in ('song','video','day','daily_song','picture_word',
--                       'story','story_song','singing_song','media_library')
--     and cmd='SELECT'
--   order by tablename;
--   -- Esperado: qual = (org_id IS NULL OR org_id = ANY (...my_org_ids...)).
--
-- 5) Ninguna policy de aislamiento usa my_org_id() single-org (debe ser my_org_ids):
--   select tablename, policyname, qual, with_check
--   from pg_policies where schemaname='public'
--     and (qual like '%my_org_id()%' or with_check like '%my_org_id()%');
--   -- Esperado: 0 filas (el aislamiento usa my_org_ids(); my_org_id() solo stamping).
-- ============================================================================


-- ############################################################################
-- ##  DOWN-MIGRATION (ROLLBACK 0400) — descomentar para revertir.            ##
-- ##  Restaura el comportamiento VIEJO: elimina las policies *_org_* de 0400 ##
-- ##  y re-crea las policies de 0100 (FOR ALL own-org) + la unica fuga       ##
-- ##  CONFIRMADA por la auditoria (word_sel). [FIX-F] NO se inventan otras    ##
-- ##  policies permisivas (song_sel/video_sel/...) para no CREAR fugas nuevas ##
-- ##  al revertir: el resto del estado pre-0400 debe restaurarse desde un     ##
-- ##  volcado real de pg_policies tomado ANTES de aplicar 0400.               ##
-- ############################################################################
--
-- begin;
--
-- -- 1) Quitar policies de 0400 en learning + coach_assignment.
-- do $$
-- declare
--   t text;
--   learning_tables text[] := array[
--     'achievement','activity_progress','chat_message','coach_note',
--     'conversation_session','daily_song','day','day_progress','fluent_lead',
--     'journal_entry','lesson_progress','media_library','picture_word',
--     'practice_result','singing_progress','singing_recording','singing_segment',
--     'singing_song','song','song_progress','story','story_song','study_session',
--     'text_edit','todo_item','todo_progress','user_coins','user_profile',
--     'user_program','user_story_progress','video','vocab_exposure','word'
--   ];
-- begin
--   foreach t in array learning_tables loop
--     execute format('drop policy if exists %I on public.%I', t || '_org_select', t);
--     execute format('drop policy if exists %I on public.%I', t || '_org_write',  t);
--   end loop;
-- end$$;
-- drop policy if exists coach_assignment_org_select on public.coach_assignment;
-- drop policy if exists coach_assignment_org_write  on public.coach_assignment;
--
-- -- 2) Re-crear las policies VIEJAS de learning con created_by (patron auditado):
-- --      <tabla>_owner ALL using(created_by=app_email()) check igual
-- --      <tabla>_admin ALL using(app_role()='admin')
-- do $$
-- declare
--   t text;
--   has_created boolean;
--   owned_tables text[] := array[
--     'achievement','activity_progress','chat_message','coach_note',
--     'conversation_session','day_progress','fluent_lead','journal_entry',
--     'lesson_progress','picture_word','practice_result','singing_progress',
--     'singing_recording','song_progress','story','study_session','text_edit',
--     'todo_item','todo_progress','user_coins','user_profile','user_program',
--     'user_story_progress','vocab_exposure','word'
--   ];
-- begin
--   foreach t in array owned_tables loop
--     select exists (select 1 from information_schema.columns
--                    where table_schema='public' and table_name=t and column_name='created_by')
--       into has_created;
--     if has_created then
--       execute format(
--         'create policy %I on public.%I for all using (created_by = public.app_email()) with check (created_by = public.app_email())',
--         t || '_owner', t);
--       execute format(
--         'create policy %I on public.%I for all using (public.app_role() = ''admin'')',
--         t || '_admin', t);
--     end if;
--   end loop;
-- end$$;
--
-- -- 3) Re-crear SOLO la fuga CONFIRMADA (word_sel). El resto del estado
-- --    permisivo pre-0400 (si lo hubiera) debe restaurarse desde el volcado real
-- --    de pg_policies pre-0400 — NO se adivina aqui para no crear fugas nuevas.
-- create policy word_sel on public.word for select using (true);
--
-- -- 4) Quitar policies backpack de 0400 y restaurar las FOR ALL de 0100.
-- drop policy if exists organizations_member_select on public.organizations;
-- drop policy if exists organizations_admin_write   on public.organizations;
-- create policy "org: own" on public.organizations
--   for all using (id = any (select public.my_org_ids()) or public.is_platform_admin())
--   with check (id = any (select public.my_org_ids()) or public.is_platform_admin());
-- drop policy if exists memberships_self_select on public.memberships;
-- drop policy if exists memberships_admin_write  on public.memberships;
-- create policy "memberships: own org" on public.memberships
--   for all using (org_id = any (select public.my_org_ids()) or public.is_platform_admin())
--   with check (org_id = any (select public.my_org_ids()) or public.is_platform_admin());
-- do $$
-- declare
--   t text;
--   backpack_tables text[] := array[
--     'calendar_events','files','leads','lessons','notes','students','tasks',
--     'team_members','transactions','vocabulary','vocabulary_progress'
--   ];
-- begin
--   foreach t in array backpack_tables loop
--     execute format('drop policy if exists %I on public.%I', t || '_org_select', t);
--     execute format('drop policy if exists %I on public.%I', t || '_org_write',  t);
--     execute format(
--       'create policy %I on public.%I for all using (org_id = any (select public.my_org_ids()) or public.is_platform_admin()) with check (org_id = any (select public.my_org_ids()) or public.is_platform_admin())',
--       t || ': own org', t);
--   end loop;
-- end$$;
--
-- -- 5) Quitar policies de las huerfanas (las columnas org_id se DEJAN).
-- drop policy if exists assessment_leads_admin_select on public.assessment_leads;
-- drop policy if exists assessment_leads_insert        on public.assessment_leads;
-- drop policy if exists assessment_leads_admin_modify  on public.assessment_leads;
-- drop policy if exists assessment_leads_admin_delete  on public.assessment_leads;
-- drop policy if exists youtube_oauth_tokens_admin_all on public.youtube_oauth_tokens;
-- -- alter table public.assessment_leads     drop column if exists org_id;
-- -- alter table public.youtube_oauth_tokens drop column if exists org_id;
--
-- -- 6) El helper NUEVO coach_of_email puede quedarse (inerte) o quitarse:
-- -- drop function if exists public.coach_of_email(text);
-- --   (NO se tocan app_email/app_role/my_org_id/my_org_ids/has_org_role: 0400
-- --    nunca los redefinio, asi que no hay nada que revertir.)
-- --
-- -- commit;
-- ############################################################################
