-- ============================================================
-- 0600_org_plan
-- ============================================================
-- Red de seguridad ADITIVA para organizations.plan.
--
-- En el esquema vivo `plan` YA EXISTE desde 001_initial_schema
--   (plan text NOT NULL DEFAULT 'starter'), por lo que ESTA MIGRACION ES UN
--   NO-OP en esa BD: `add column if not exists` no toca la columna existente
--   (ni su NOT NULL ni su default). Solo crea la columna —como NULLABLE— en
--   entornos antiguos/copias donde, por lo que sea, falte.
--
-- El motor lib/provisioning.ts es TOLERANTE: intenta insertar con `plan` y, si
--   la columna no existiera (42703 / PGRST204), reintenta sin ella. Esta
--   migracion solo garantiza que la columna acabe presente.
--
-- No se anade CHECK de valores: el panel usa starter|school|growth|enterprise
--   (libres) y el webhook de Stripe podra mapear otros planes sin romper.
--
-- IDEMPOTENTE. ADITIVA (nunca destructiva). DOWN-migration comentada al final.
-- NO se aplica aqui: es un archivo; se prueba primero sobre una COPIA.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception
      '0600_org_plan: falta public.organizations. Aplica primero 0100_organizations_core (rename schools->organizations).';
  end if;
end$$;

-- Columna ADITIVA y NULLABLE (no se fuerza NOT NULL para no romper filas
-- previas en entornos donde se cree fresca aqui). No-op si ya existe.
alter table public.organizations
  add column if not exists plan text;

comment on column public.organizations.plan is
  'Plan comercial de la escuela (starter|school|growth|enterprise; libre). Lo setea el alta (panel platform-admin o webhook de Stripe).';

commit;

-- ============================================================
-- DOWN-MIGRATION (rollback) — descomentar para revertir.
-- ¡OJO! Solo revertir en entornos donde 0600 CREO la columna. En la BD viva
-- `plan` pertenece a 001_initial_schema: NO la borres ahi (perderias datos).
-- ============================================================
-- begin;
--   alter table public.organizations drop column if exists plan;
-- commit;
-- ============================================================
