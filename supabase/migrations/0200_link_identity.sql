-- ============================================================
-- 0200_link_identity.sql
-- ============================================================
-- OBJETIVO
--   Ligar los usuarios de auth existentes a la organizacion Masteri.
--   1) Una membership por cada auth.users (rol inferido del censo / app_metadata).
--   2) Un perfil en students (con username = slug del email) por cada
--      membership con rol 'student'.
--
--   NOTA: el backfill de coach_assignment.org_id NO se hace aqui.
--   coach_assignment es una tabla LEARNING; su columna org_id la crea y la
--   rellena (a Masteri) la migracion 0300_learning_org_id. Hacerlo aqui
--   FALLABA porque 0200 corre ANTES de 0300 (orden por nombre de archivo:
--   001 -> 0100 -> 0200 -> 0300 -> 0500) y la columna aun no existe.
--   Ver REVISION ADVERSARIAL mas abajo.
--
-- CONTEXTO / SUPUESTOS (ver MEMORY + Arquitectura-Backpack.md)
--   - La migracion 0100_organizations_core ya renombro el esquema backpack:
--       schools       -> organizations   (col slug, id)
--       school_users  -> memberships     (cols: id, org_id, user_id, role, created_at;
--                                          role TEXT CHECK (owner|admin|coach|student),
--                                          unique(org_id, user_id))
--       students.school_id -> students.org_id   (org_id NOT NULL, FK -> organizations)
--     y existen los helpers app_role() / app_email() (leen el JWT de la peticion)
--     y my_org_id() / has_org_role() / is_platform_admin().
--   - Masteri es el tenant #1, identificado por organizations.slug = 'masteri'.
--   - Esta migracion es un ARCHIVO. No se aplica aqui. Se probara primero
--     sobre una COPIA. Es idempotente (on conflict do nothing) y trae su
--     DOWN-migration comentada al final.
--
-- NOTA CRITICA SOBRE EL ORIGEN DEL ROL ("el censo")
--   El rol real vive en el app_metadata de cada usuario, que en runtime se
--   expone via app_role() (que lee auth.jwt() -> 'app_metadata' ->> 'role').
--   PERO una migracion NO corre dentro de una peticion con JWT: auth.jwt() es
--   NULL aqui, asi que app_role() devolveria NULL durante el backfill.
--   Por eso el CASE de abajo lee DIRECTAMENTE la fuente subyacente del censo:
--       auth.users.raw_app_meta_data ->> 'role'   (= app_metadata.role)
--   con respaldo en raw_user_meta_data ->> 'role' y default 'student'.
--   Esto reproduce la semantica de app_role() pero usando la tabla, no el JWT.
--   -- TODO confirmar censo manual: revisar fila por fila que el rol inferido
--   --      coincide con el rol real esperado de cada persona antes de aplicar.
--
-- ============================================================
-- REVISION ADVERSARIAL (cambios respecto al borrador previo)
-- ============================================================
--   [FIX-1] (CRITICO, orden/columna inexistente) Se ELIMINO la seccion 3 que
--           hacia UPDATE public.coach_assignment SET org_id=Masteri. Esa
--           columna NO existe cuando corre 0200 (la crea 0300). Ademas era
--           REDUNDANTE: 0300 ya hace ese mismo backfill a Masteri. Mantenerlo
--           aqui rompia toda la transaccion 0200 con "column org_id does not
--           exist". El backfill de coach_assignment es responsabilidad de 0300.
--
--   [FIX-2] (MEDIO, DOWN destructiva) La DOWN-migration ya NO borra TODOS los
--           students de Masteri (eso borraria alumnos reales creados despues).
--           Ahora borra SOLO los perfiles placeholder creados por esta
--           migracion, identificados por un marcador en meta->>'seed_source'
--           = '0200_link_identity'. Se estampa ese marcador en el INSERT.
--
--   [FIX-3] (BAJO, fuga cross-tenant) NO se cierra aqui el leak conocido
--           (word_sel USING(true) y policies permisivas de las 34 tablas
--           learning). 0200 corre ANTES de 0300, asi que org_id aun no existe
--           en esas tablas y una policy org-based seria imposible de escribir.
--           Cerrar esas policies es responsabilidad de una migracion RLS
--           POSTERIOR a 0300 (p.ej. 0400_learning_rls). Ver bloque "RIESGO
--           ABIERTO" al final. 0200 no toca RLS de learning -> blast radius nulo
--           sobre el portal vivo.
--
--   [FIX-4] (BAJO, seguridad) Las inserciones de 0200 (memberships, students)
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
--    Rol inferido del censo (app_metadata) con CASE; default 'student'.
-- ============================================================
-- El CASE normaliza el valor crudo del censo a los 4 roles validos del
-- CHECK de memberships (owner|admin|coach|student). Cualquier valor
-- desconocido o ausente cae a 'student' (el rol de menor privilegio).
-- -- TODO confirmar censo manual: este mapeo asume que app_metadata.role ya
-- --      usa exactamente owner|admin|coach|student. Si el censo trae alias
-- --      (p.ej. 'teacher' -> coach, 'staff' -> admin), agregalos al CASE.
insert into public.memberships (org_id, user_id, role)
select
  org.id                                              as org_id,
  u.id                                                as user_id,
  case
    -- fuente primaria del censo: app_metadata.role (lo que app_role() leeria del JWT)
    when lower(coalesce(u.raw_app_meta_data  ->> 'role', '')) in ('owner')   then 'owner'
    when lower(coalesce(u.raw_app_meta_data  ->> 'role', '')) in ('admin')   then 'admin'
    when lower(coalesce(u.raw_app_meta_data  ->> 'role', '')) in ('coach')   then 'coach'
    when lower(coalesce(u.raw_app_meta_data  ->> 'role', '')) in ('student') then 'student'
    -- respaldo: user_metadata.role (por si el censo quedo del lado user, no app)
    when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) in ('owner')   then 'owner'
    when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) in ('admin')   then 'admin'
    when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) in ('coach')   then 'coach'
    when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) in ('student') then 'student'
    -- default seguro
    else 'student'  -- -- TODO confirmar censo manual
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
-- (Se elimino la antigua seccion 3: backfill de coach_assignment.org_id.
--  Ver [FIX-1] en el header. Ese backfill lo hace 0300_learning_org_id,
--  que es quien crea la columna coach_assignment.org_id y la rellena a
--  Masteri. Hacerlo aqui rompia 0200 por columna inexistente y era
--  redundante.)
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
-- -- (coach_assignment.org_id se verifica tras aplicar 0300, no aqui)


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
--   - coach_assignment.org_id (eso lo revierte la DOWN de 0300)
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
-- RIESGO ABIERTO (NO resuelto por 0200, requiere migracion posterior a 0300)
-- ============================================================
-- FUGA CROSS-TENANT en las 34 tablas LEARNING. La auditoria del portal vivo
-- confirma policies permisivas tipo:
--     word_sel  ->  SELECT using(true)     <-- cualquiera lee TODOS los words
-- y se asumen policies similares (using(true)) en otras tablas learning.
-- Mientras solo exista Masteri no hay fuga real, pero EN CUANTO entre un
-- segundo tenant esas policies using(true) dejaran que cualquier usuario
-- autenticado lea filas de OTRA org. Esto NO se puede cerrar en 0200 porque:
--   (a) 0200 corre ANTES de 0300, asi que org_id aun no existe en learning;
--   (b) tocar la RLS del portal vivo es ALTO RIESGO y debe ir en su propia
--       migracion (p.ej. 0400_learning_rls), aplicada/probada sobre COPIA,
--       PRESERVANDO app_email()/app_role()/created_by y AÑADIENDO el eje:
--           using( (created_by = app_email() OR app_role() = 'admin' OR ...)
--                  AND org_id = any(array(select my_org_ids())) )
--       con WITH CHECK explicito en las policies ALL/INSERT/UPDATE para que
--       nadie pueda escribir filas con un org_id ajeno.
-- ACCION REQUERIDA antes de onboardear el tenant #2: crear 0400_learning_rls.
-- ============================================================
