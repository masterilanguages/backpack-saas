-- ============================================================================
-- 0400_rls_reconcile.sql   (ADVERSARIAL-CORRECTED)
-- ============================================================================
-- OBJETIVO
--   Reconciliar RLS hacia DOS EJES: (1) tenant = org_id, (2) dueno/rol de fila,
--   SIN romper el portal vivo (cliente ANON + helpers app_email()/app_role()
--   + ownership por created_by(email)).
--
-- ----------------------------------------------------------------------------
-- CAMBIOS DE LA REVISION ADVERSARIAL (vs. el borrador previo de 0400)
-- ----------------------------------------------------------------------------
--   [FIX-A] (CRITICO) NO se re-crea has_org_role(text). 0100_organizations_core
--           YA definio la AUTORIDAD canonica has_org_role(uuid,text) (con
--           jerarquia de roles + is_platform_admin()), y 0500_subscriptions
--           DEPENDE de esa firma. Crear un overload has_org_role(text) generaba
--           DOS funciones distintas, ignoraba platform_admins y divergia de la
--           unica fuente de verdad. Aqui se USA has_org_role(public.my_org_id(),
--           'admin') (guardado contra NULL), nada se redefine.
--
--   [FIX-B] (CRITICO, MAXIMO RIESGO PROD) NO se hace create-or-replace de
--           app_role()/app_email()/my_org_id(). Sus cuerpos VIVOS no estan en
--           ningun archivo de migracion y NO se pudieron leer esta sesion;
--           sobrescribirlos a ciegas (adivinando el formato del JWT) podria
--           cambiar el gating del portal y dejar fuera / sobre-exponer usuarios
--           reales. En su lugar se ASERTA que existen y se aborta con mensaje
--           claro si faltan. Sus cuerpos quedan INTACTOS. Solo se crea el helper
--           NUEVO coach_of_email(text) (no existia).
--
--   [FIX-C] (CRITICO, FUGA CROSS-TENANT) El barrido del paso 1 ahora elimina
--           TODAS las policies permisivas viejas de las tablas learning (no solo
--           using(true)). Razon: las permisivas se combinan con OR; dejar viva
--           una policy vieja tipo `_admin using(app_role()='admin')` SIN filtro
--           de org permite que un admin de la org A lea filas de la org B en
--           cuanto entre el tenant #2. Las nuevas policies de dos ejes ya
--           replican owner/admin/coach DENTRO del tenant, asi que borrar las
--           viejas NO le quita acceso al portal. Se preserva el acceso, se cierra
--           el cross-tenant.
--
--   [FIX-D] (CRITICO, ESCALADA DE PRIVILEGIO) 0100 creo policies FOR ALL
--           ("org: own", "memberships: own org", "<t>: own org") que dejan a
--           CUALQUIER miembro (incluido student) ESCRIBIR datos de la org. Aqui
--           se DROPEAN esas policies FOR ALL y se reemplazan por SELECT-para-
--           miembros + WRITE-solo-admin/owner. Sin esto, un alumno podria
--           INSERT/UPDATE/DELETE en organizations/memberships/students/etc.
--
--   [FIX-E] (ALTO) coach_assignment: se INTROSPECCIONAN coach_email/student_email
--           antes de referenciarlas. Si no existen (no estan en ningun archivo;
--           vienen del esquema vivo), se cae a admin-only en vez de emitir SQL
--           que referencie una columna inexistente y aborte toda la migracion.
--
--   [FIX-F] (MEDIO) La DOWN-migration ya NO inventa policies permisivas
--           (song_sel/video_sel/...) que quiza nunca existieron: re-crearlas
--           seria CREAR fugas nuevas al revertir. Solo restaura word_sel (la
--           unica fuga confirmada por la auditoria) y deja una nota para
--           restaurar el resto desde un volcado real de pg_policies pre-0400.
--
-- DEPENDENCIAS (deben existir ANTES de aplicar 0400; se asertan abajo):
--   - 0100_organizations_core: organizations, memberships, my_org_id(),
--       my_org_ids(), has_org_role(uuid,text), is_platform_admin(),
--       platform_admins.
--   - 0300_learning_org_id: org_id en las 34 learning + coach_assignment,
--       triggers stamp_org_id()/freeze_org_id().
--   - helpers VIVOS app_email()/app_role() (del portal; NO en archivos).
--
-- ORDEN DE APLICACION: 001 -> 0100 -> (0150/0300 antes que 0200, ver hazard en
--   0300) -> 0200 -> 0500 -> 0400. Este 0400 es el ULTIMO en RLS y asume que
--   org_id ya existe en las learning (0300). Si se aplica antes de 0300, las
--   ramas de tenant caen a TRUE (no-op) y solo aplica el eje dueno/rol — no
--   rompe, pero no aisla por tenant hasta re-correrlo tras 0300.
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
  -- Autoridad multi-tenant (0100). Firma EXACTA has_org_role(uuid,text).
  if to_regclass('public.organizations') is null then
    raise exception '0400: falta public.organizations. Aplica 0100_organizations_core primero.';
  end if;
  if to_regclass('public.memberships') is null then
    raise exception '0400: falta public.memberships. Aplica 0100_organizations_core primero.';
  end if;
  if to_regproc('public.my_org_id') is null then
    raise exception '0400: falta public.my_org_id(). Aplica 0100_organizations_core primero.';
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
-- 0b. UNICO helper NUEVO: coach_of_email(p_email).
--     true si el usuario actual es coach asignado al alumno p_email, DENTRO de
--     su org. Centraliza el patron coach<->alumno. SECURITY DEFINER, search_path
--     fijo. Se construye DEFENSIVO: si coach_assignment no tiene las columnas
--     esperadas (vienen del esquema vivo, no de archivos), la funcion devuelve
--     false en vez de fallar. [FIX-E]
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
            and (ca.org_id is null or ca.org_id = public.my_org_id())
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
--    sin filtro de org (using(true), o created_by-only, o app_role()='admin'-only)
--    permite leer/escribir filas de OTRO tenant en cuanto entre el segundo. Las
--    nuevas policies de dos ejes replican owner/admin/coach DENTRO del tenant,
--    asi que el portal NO pierde acceso.
--    Se respetan/saltan las nuevas *_org_* por si el archivo se re-ejecuta.
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
-- 2. LEARNING — reescritura a DOS EJES (org_id + dueno/rol).
--    Por cada una de las 34 tablas se introspecciona created_by / approved /
--    org_id y se emiten dos policies idempotentes (SELECT + ALL con with_check).
--    Predicado:
--      ( org_id IS NULL OR org_id = my_org_id() )                      -- tenant
--      AND
--      ( app_role()='admin'                                           -- admin JWT (portal)
--        OR has_org_role(my_org_id(),'admin')                         -- admin/owner via membership (+platform)
--        [OR created_by = app_email() OR coach_of_email(created_by)]   -- dueno / coach
--        [OR approved = true] )                                        -- catalogo aprobado
--    Tenant NULL-tolerant durante la transicion (tras backfill+NOTNULL en 0500/0600
--    el eje se vuelve estricto sin tocar policies). with_check SIEMPRE.
--    [FIX-A] usa has_org_role(uuid,text), NO un overload de 1 arg.
-- ----------------------------------------------------------------------------
do $learn$
declare
  t             text;
  has_created   boolean;
  has_approved  boolean;
  has_orgid     boolean;
  tenant_clause text;
  owner_clause  text;
  full_clause   text;
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

    if has_orgid then
      tenant_clause := '(org_id is null or org_id = public.my_org_id())';
    else
      tenant_clause := 'true';   -- 0300 no aplicado aun: eje tenant no-op (no rompe)
    end if;

    -- admin de la org SIEMPRE (dos vias: claim del portal + membership canonica).
    -- has_org_role recibe my_org_id() (puede ser null -> coalesce a false dentro
    -- de la funcion canonica de 0100, que hace exists(... and org_id = p_org)).
    owner_clause := 'public.app_role() = ''admin'''
                 || ' or public.has_org_role(public.my_org_id(), ''admin'')';
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
  end loop;
end
$learn$;

-- ----------------------------------------------------------------------------
-- 2b. coach_assignment — el VINCULO coach<->alumno (no es fila "de alumno").
--     Visible/editable por admin/owner de la org, el coach o el alumno del
--     vinculo. Tenant NULL-tolerant. with_check obligatorio.
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
    tenant_clause := '(org_id is null or org_id = public.my_org_id())';
  else
    tenant_clause := 'true';
  end if;

  ident_clause := 'public.app_role() = ''admin'''
               || ' or public.has_org_role(public.my_org_id(), ''admin'')';
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
-- 3. BACKPACK (admin) — SELECT para miembros de la org, WRITE solo admin/owner.
--    [FIX-D] Se DROPEAN primero las policies FOR ALL que dejo 0100
--    ("org: own", "memberships: own org", "<t>: own org"), porque permiten a
--    CUALQUIER miembro (incluido student) escribir datos de la org (escalada).
--    Estas tablas estan VACIAS hoy -> bajo riesgo. with_check obligatorio.
-- ----------------------------------------------------------------------------

-- organizations: ver SOLO la propia (o platform); escribir solo owner/admin.
alter table public.organizations enable row level security;
drop policy if exists "org: own"    on public.organizations;     -- 0100 FOR ALL (escalada)
drop policy if exists "school: own" on public.organizations;

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations
  for select using (
    id = any (array(select public.my_org_ids()))
    or public.is_platform_admin()
  );

drop policy if exists organizations_admin_write on public.organizations;
create policy organizations_admin_write on public.organizations
  for all
  using (public.has_org_role(id, 'admin'))
  with check (public.has_org_role(id, 'admin'));

-- memberships: ver las propias o las de la(s) org(s); gestionar solo admin/owner.
-- (SELECT amplio a miembros evita el bootstrap-deadlock de my_org_id().)
alter table public.memberships enable row level security;
drop policy if exists "memberships: own org" on public.memberships;  -- 0100 FOR ALL (escalada)
drop policy if exists "school_users: own school" on public.memberships;

drop policy if exists memberships_self_select on public.memberships;
create policy memberships_self_select on public.memberships
  for select using (
    user_id = auth.uid()
    or org_id = any (array(select public.my_org_ids()))
    or public.is_platform_admin()
  );

drop policy if exists memberships_admin_write on public.memberships;
create policy memberships_admin_write on public.memberships
  for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));

-- Resto de tablas backpack (con org_id). SELECT: miembro de la org.
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
      || '(org_id = any (array(select public.my_org_ids())) or public.is_platform_admin())',
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
-- (El formulario publico puede insertar con org_id NULL o = su org; nunca leer.)
drop policy if exists assessment_leads_admin_select on public.assessment_leads;
create policy assessment_leads_admin_select on public.assessment_leads
  for select using (
    public.is_platform_admin()
    or (org_id is not null and public.has_org_role(org_id, 'admin'))
  );

drop policy if exists assessment_leads_insert on public.assessment_leads;
create policy assessment_leads_insert on public.assessment_leads
  for insert
  with check (org_id is null or org_id = public.my_org_id());

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
-- 1) 0 policies permisivas using(true) en las tablas scopeadas:
--   select pol.tablename, pol.policyname
--   from pg_policies pol
--   join pg_class c on c.relname=pol.tablename
--   join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname=pol.schemaname
--   join pg_policy p on p.polname=pol.policyname and p.polrelid=c.oid
--   where pol.schemaname='public'
--     and (p.polqual is null or btrim(lower(pg_get_expr(p.polqual,p.polrelid)))='true');
--   -- Esperado: 0 (salvo INSERTs publicos intencionales, p.ej. assessment_leads_insert).
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
-- 4) NINGUNA tabla learning/backpack debe conservar una policy vieja sin filtro
--    de org (ya barridas en paso 1). Confirmar con:
--   select tablename, policyname, cmd, qual
--   from pg_policies where schemaname='public'
--     and tablename in ('word','user_profile','media_library','students','memberships')
--   order by tablename, policyname;
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
--   for all using (id = any (array(select public.my_org_ids())) or public.is_platform_admin());
-- drop policy if exists memberships_self_select on public.memberships;
-- drop policy if exists memberships_admin_write  on public.memberships;
-- create policy "memberships: own org" on public.memberships
--   for all using (org_id = any (array(select public.my_org_ids())) or public.is_platform_admin());
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
--       'create policy %I on public.%I for all using (org_id = any (array(select public.my_org_ids())) or public.is_platform_admin())',
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
-- --   (NO se tocan app_email/app_role/my_org_id/has_org_role: 0400 nunca los
-- --    redefinio, asi que no hay nada que revertir.)
-- --
-- -- commit;
-- ############################################################################
