-- ============================================================
-- 0200_link_identity.sql
-- ============================================================
-- ORDEN OFICIAL DE MIGRACIONES: 001 -> 0100 -> 0300 -> 0200 -> 0500 -> 0400.
--   0200 corre DESPUES de 0300 (que crea/rellena org_id en las tablas
--   learning) y ANTES de 0500 / 0400 (RLS). Este header refleja ese orden.
--
-- OBJETIVO
--   Ligar los usuarios de auth existentes a la organizacion Masteri.
--   1) Una membership por cada auth.users (rol mapeado del censo real).
--   2) Un perfil en students (con username = slug del email) por cada
--      membership con rol 'student'.
--
-- CONTEXTO / SUPUESTOS (ver MEMORY + Arquitectura-Backpack.md)
--   - La migracion 0100_organizations_core ya renombro el esquema backpack:
--       schools       -> organizations   (col slug, id)
--       school_users  -> memberships     (cols: id, org_id, user_id, role, created_at;
--                                          role TEXT CHECK (owner|admin|coach|student),
--                                          unique(org_id, user_id))
--       students.school_id -> students.org_id   (org_id NOT NULL, FK -> organizations)
--     y existen los helpers app_role() / app_email() (leen el JWT de la peticion)
--     y my_org_id() / my_org_ids() / has_org_role() / is_platform_admin().
--   - Masteri es el tenant #1, identificado por organizations.slug = 'masteri'.
--   - Esta migracion es un ARCHIVO. No se aplica aqui. Se probara primero
--     sobre una COPIA. Es idempotente (on conflict do nothing) y trae su
--     DOWN-migration comentada al final.
--
-- CENSO REAL (mapeo de roles EXACTO)
--   El censo confirmado son 8 usuarios: 1 owner + 7 student, 0 coaches.
--   El rol real vive en el app_metadata de cada usuario, que en runtime se
--   expone via app_role() (que lee auth.jwt() -> 'app_metadata' ->> 'role').
--   PERO una migracion NO corre dentro de una peticion con JWT: auth.jwt() es
--   NULL aqui, asi que app_role() devolveria NULL durante el backfill.
--   Por eso el CASE de abajo lee DIRECTAMENTE la fuente subyacente del censo:
--       auth.users.raw_app_meta_data ->> 'role'   (= app_metadata.role)
--   con respaldo en raw_user_meta_data ->> 'role'.
--   MAPEO EXACTO (fiel al censo, sin coaches):
--       role / user_role = 'admin'  ->  membership.role = 'owner'
--       resto ('user', vacio, NULL) ->  membership.role = 'student'
--   No se mapea 'coach' porque el censo real tiene 0 coaches.
--
-- ============================================================
-- REVISION ADVERSARIAL (cambios respecto al borrador previo)
-- ============================================================
--   [FIX-1] (MEDIO, DOWN destructiva) La DOWN-migration ya NO borra TODOS los
--           students de Masteri (eso borraria alumnos reales creados despues).
--           Ahora borra SOLO los perfiles placeholder creados por esta
--           migracion, identificados por un marcador en meta->>'seed_source'
--           = '0200_link_identity'. Se estampa ese marcador en el INSERT.
--
--   [FIX-2] (BAJO, seguridad) Las inserciones de 0200 (memberships, students)
--           son tablas backpack con RLS org-based (NO force RLS), de modo que el
--           rol de migracion (owner) inserta sin que RLS lo bloquee. Verificado
--           que ninguna de estas dos tablas tiene FORCE ROW LEVEL SECURITY (solo
--           subscriptions la fuerza). Si en el futuro se agrega FORCE a students/
--           memberships, este INSERT debera correr como service_role/owner.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) Guard rails: la organizacion Masteri debe existir, y el esquema
--    renombrado (organizations/memberships + students.org_id) debe estar
--    aplicado. Si falta algo, abortamos con un mensaje claro en vez de
--    fallar a media transaccion con un error oscuro de columna inexistente.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception
      '0200_link_identity: no existe public.organizations. Aplica primero 0100_organizations_core (rename schools->organizations).';
  end if;

  if to_regclass('public.memberships') is null then
    raise exception
      '0200_link_identity: no existe public.memberships. Aplica primero 0100_organizations_core (rename school_users->memberships).';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'students' and column_name = 'org_id'
  ) then
    raise exception
      '0200_link_identity: students.org_id no existe (¿sigue como school_id?). Aplica primero 0100_organizations_core.';
  end if;

  if not exists (select 1 from public.organizations where slug = 'masteri') then
    raise exception
      '0200_link_identity: no existe organizations.slug = ''masteri''. '
      'Aplica primero las migraciones que crean/renombran organizations y migran el seed.';
  end if;
end$$;

-- ============================================================
-- 1) MEMBERSHIPS — una fila por cada auth.users en Masteri.
--    Mapeo de roles EXACTO segun el CENSO REAL (1 owner + 7 student, 0 coaches).
-- ============================================================
-- MAPEO EXACTO (fiel al censo):
--     app_metadata.role  / user_metadata.role  = 'admin'  ->  'owner'
--     cualquier otro valor ('user', vacio, NULL, etc.)     ->  'student'
-- No se mapea 'coach' (el censo real tiene 0 coaches) ni se usa 'admin' como
-- rol de membership: el unico administrador real del tenant es el 'owner'.
-- El resultado siempre cae dentro del CHECK de memberships (owner|...|student).
insert into public.memberships (org_id, user_id, role)
select
  org.id                                              as org_id,
  u.id                                                as user_id,
  case
    -- el unico rol elevado del censo es 'admin' (app_metadata o user_metadata) -> 'owner'
    when lower(coalesce(u.raw_app_meta_data  ->> 'role',      '')) = 'admin' then 'owner'
    when lower(coalesce(u.raw_app_meta_data  ->> 'user_role', '')) = 'admin' then 'owner'
    when lower(coalesce(u.raw_user_meta_data ->> 'role',      '')) = 'admin' then 'owner'
    when lower(coalesce(u.raw_user_meta_data ->> 'user_role', '')) = 'admin' then 'owner'
    -- resto del censo (7 student): 'user', vacio o NULL -> 'student'
    else 'student'
  end                                                 as role
from auth.users u
cross join (select id from public.organizations where slug = 'masteri') org
on conflict (org_id, user_id) do nothing;  -- idempotente: respeta unique(org_id,user_id)

-- ============================================================
-- 2) STUDENTS — perfil + username (= slug del email) para cada
--    membership con rol 'student' en Masteri que aun no tenga perfil.
-- ============================================================
-- 2.a) Asegurar que students tenga la columna username (idempotente).
--      Si una migracion previa ya la creo, este ALTER es no-op.
alter table public.students
  add column if not exists username text;

-- 2.b) Indice unico de username POR organizacion (no global): dos orgs
--      distintas pueden tener el mismo username sin chocar. Idempotente.
create unique index if not exists students_org_username_key
  on public.students (org_id, username)
  where username is not null;

-- 2.c) Insertar perfiles. El username base = slug del local-part del email
--      (parte antes de la @), saneado a [a-z0-9-]. La desambiguacion -2, -3…
--      se resuelve con un ROW_NUMBER por (org_id, base_slug) + un sufijo
--      adicional contra colisiones preexistentes en la tabla.
with org as (
  select id from public.organizations where slug = 'masteri'
),
-- usuarios que SON student en Masteri segun la membership recien creada
student_users as (
  select u.id as user_id, u.email
  from public.memberships m
  join org on org.id = m.org_id
  join auth.users u on u.id = m.user_id
  where m.role = 'student'
),
-- slug base a partir del email: minusculas, local-part, no alfanumerico -> '-',
-- colapsar guiones, recortar guiones extremos; fallback 'student' si queda vacio.
slugged as (
  select
    su.user_id,
    su.email,
    coalesce(
      nullif(
        trim(both '-' from
          regexp_replace(
            regexp_replace(
              lower(split_part(coalesce(su.email, ''), '@', 1)),
              '[^a-z0-9]+', '-', 'g'
            ),
            '-{2,}', '-', 'g'
          )
        ),
        ''
      ),
      'student'
    ) as base_slug
  from student_users su
),
-- desambiguacion -2,-3 ENTRE los nuevos del mismo lote (mismo base_slug)
ranked as (
  select
    s.user_id,
    s.email,
    s.base_slug,
    row_number() over (
      partition by s.base_slug
      order by s.email, s.user_id
    ) as rn
  from slugged s
),
candidate as (
  select
    r.user_id,
    r.email,
    case when r.rn = 1 then r.base_slug
         else r.base_slug || '-' || r.rn::text
    end as username
  from ranked r
),
-- segunda pasada de desambiguacion contra usernames YA existentes en la
-- tabla para esta org (filas creadas en corridas anteriores u otra fuente).
deconflicted as (
  select
    c.user_id,
    c.email,
    case
      when exists (
        select 1 from public.students ex, org
        where ex.org_id = org.id and ex.username = c.username
      )
      then c.username || '-' || substr(c.user_id::text, 1, 4)
      else c.username
    end as username
  from candidate c
)
insert into public.students (org_id, name, email, username, status, meta)
select
  org.id,
  -- nombre legible por defecto = local-part del email (placeholder)
  coalesce(nullif(split_part(coalesce(d.email, ''), '@', 1), ''), 'Student') as name,
  d.email,
  d.username,
  'Active',
  -- [FIX-2] marcador de origen para que la DOWN-migration borre SOLO estos
  -- placeholders y no alumnos reales creados despues por el admin.
  jsonb_build_object('seed_source', '0200_link_identity') as meta
from deconflicted d
cross join org
-- idempotencia: no recrear el perfil si ya existe uno con ese email o username en la org
where not exists (
  select 1 from public.students ex
  where ex.org_id = org.id
    and (
      (ex.email is not null and d.email is not null and lower(ex.email) = lower(d.email))
      or ex.username = d.username
    )
);

-- ------------------------------------------------------------
-- (No hay backfill de coach_assignment.org_id en 0200: esa columna la crea y
--  la rellena 0300_learning_org_id, que en el ORDEN OFICIAL corre ANTES de
--  0200. 0200 solo liga identidades (memberships + students); no toca tablas
--  learning.)
-- ------------------------------------------------------------

commit;

-- ============================================================
-- VERIFICACION (manual, opcional — ejecutar fuera de la migracion)
-- ============================================================
-- select count(*) as auth_users from auth.users;
-- select role, count(*) from public.memberships m
--   join public.organizations o on o.id = m.org_id and o.slug='masteri'
--   group by role order by role;
-- select count(*) as students from public.students s
--   join public.organizations o on o.id = s.org_id and o.slug='masteri';
-- -- censo esperado: role='owner' => 1 ; role='student' => 7 ; coach => 0.


-- ============================================================
-- ============================================================
-- DOWN-MIGRATION (ROLLBACK) — descomentar y ejecutar para revertir.
-- Borra SOLO lo creado por esta migracion para la organizacion Masteri:
--   - students placeholder de Masteri creados por 0200
--     (filtrados por meta->>'seed_source' = '0200_link_identity')
--   - memberships de Masteri
-- NO borra:
--   - usuarios de auth.users
--   - la organizacion en si
--   - alumnos reales de Masteri creados despues (sin el marcador seed_source)
--   - coach_assignment.org_id (lo gestiona 0300, no 0200)
-- ============================================================
-- begin;
--
-- -- 2') borrar SOLO los perfiles students placeholder creados por 0200.
-- --     [FIX-2] el filtro por meta->>'seed_source' evita borrar alumnos reales.
-- delete from public.students s
-- using (select id from public.organizations where slug = 'masteri') org
-- where s.org_id = org.id
--   and s.meta ->> 'seed_source' = '0200_link_identity';
--
-- -- 1') borrar memberships de Masteri
-- delete from public.memberships m
-- using (select id from public.organizations where slug = 'masteri') org
-- where m.org_id = org.id;
--
-- -- (opcional) revertir el DDL aditivo de la seccion 2:
-- -- drop index if exists public.students_org_username_key;
-- -- alter table public.students drop column if exists username;
--
-- commit;
-- ============================================================


-- ============================================================
-- RIESGO ABIERTO (NO resuelto por 0200, se cierra en 0400_learning_rls)
-- ============================================================
-- FUGA CROSS-TENANT en las 34 tablas LEARNING. La auditoria del portal vivo
-- confirma policies permisivas tipo:
--     word_sel  ->  SELECT using(true)     <-- cualquiera lee TODOS los words
-- y se asumen policies similares (using(true)) en otras tablas learning.
-- Mientras solo exista Masteri no hay fuga real, pero EN CUANTO entre un
-- segundo tenant esas policies using(true) dejaran que cualquier usuario
-- autenticado lea filas de OTRA org. Esto NO se cierra en 0200 porque:
--   (a) 0200 solo liga identidades (memberships + students); no toca RLS de
--       learning -> blast radius nulo sobre el portal vivo;
--   (b) tocar la RLS del portal vivo es ALTO RIESGO y debe ir en su propia
--       migracion (0400_learning_rls), que en el ORDEN OFICIAL corre al final
--       (... -> 0200 -> 0500 -> 0400), aplicada/probada sobre COPIA,
--       PRESERVANDO app_email()/app_role()/created_by y AÑADIENDO el eje:
--           using( (created_by = app_email() OR app_role() = 'admin' OR ...)
--                  AND org_id = any(select my_org_ids()) )
--       con WITH CHECK explicito en las policies ALL/INSERT/UPDATE para que
--       nadie pueda escribir filas con un org_id ajeno.
-- ACCION REQUERIDA antes de onboardear el tenant #2: 0400_learning_rls.
-- ============================================================
