-- ============================================================
-- 0500_subscriptions
-- ============================================================
-- Tabla de suscripciones / entitlements de Stripe (mode-agnostic).
--
-- Una fila representa el "derecho de acceso" (entitlement) de un cliente
-- dentro de una organizacion, generado por Stripe. Funciona para:
--   * Suscripciones recurrentes  -> stripe_subscription_id + periodos.
--   * Pagos unicos (one-time)     -> stripe_checkout_session_id, sin periodo.
--   * Cuotas / mixto              -> billing_mode discrimina el caso.
-- Por eso `billing_mode` arranca en 'unknown': el webhook lo resuelve.
--
-- IDEMPOTENCIA DEL WEBHOOK: indices unicos PARCIALES sobre
--   stripe_subscription_id y stripe_checkout_session_id (solo NOT NULL),
--   de modo que un reenvio del mismo evento haga UPSERT y no duplique.
--
-- TENANCY: cada fila lleva org_id (FK a organizations). El email/user_id
--   identifican a la persona; el alta puede llegar ANTES de existir el
--   usuario en auth.users (checkout primero, login despues) -> user_id NULL.
--
-- RLS (mode-agnostic, no asume recurrente vs one-time):
--   * platform  -> ve TODAS las suscripciones (super-admin).
--   * owner      -> ve las suscripciones de SU organizacion.
--   * user       -> ve la SUYA (por user_id o por email verificado).
--
-- SEGURIDAD: este es dato sensible de cobro. RLS es restrictiva por
--   defecto (deny-all) y solo las policies de abajo abren acceso (SOLO
--   SELECT para owner/user; el webhook escribe con service_role, que
--   bypassea RLS). Asi NADIE puede inventar/alterar un cobro desde el
--   cliente anon.
--
-- AUTORIDAD REUSADA (NO se inventa nada nuevo): este archivo se apoya en
--   los helpers ya definidos por 0100_organizations_core:
--     * public.is_platform_admin()   -> super-admin (tabla platform_admins,
--                                        NO un claim de JWT spoofeable).
--     * public.has_org_role(org,rol)  -> rol >= en esa org, con escape de
--                                        plataforma incluido.
--   Mantiene una sola fuente de verdad de autoridad multi-tenant.
--
-- DEPENDENCIAS (deben existir ANTES de aplicar 0500; se valida abajo y se
--   aborta con mensaje claro si faltan):
--     * tabla    public.organizations        (rename schools->organizations)
--     * tabla    public.memberships          (rename school_users->memberships)
--     * funcion  public.is_platform_admin()   (de 0100)
--     * funcion  public.has_org_role(uuid,text) (2-arg canonico, de 0100)
--   => aplicar PRIMERO 0100_organizations_core.
--
-- ORDEN OFICIAL de migraciones: 001 -> 0100 -> 0300 -> 0200 -> 0500 -> 0400.
--   0500 corre DESPUES de 0100 (helpers de autoridad multi-tenant) y de la
--   carga de identidad (0200), y ANTES del reconcile final de RLS (0400).
--
-- IDEMPOTENTE. Transaccional (begin/commit) como sus hermanas 0100/0200/0300:
--   si algo falla, no deja la migracion a medio aplicar.
-- DOWN-migration comentada al final.
-- ============================================================

begin;

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 0. PRECONDICIONES: dependencias de 0100 deben existir.
--    Falla fuerte y claro en vez de reventar con un error de FK
--    o de "function does not exist" a mitad de camino.
-- ------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.organizations') is null then
    raise exception
      '0500_subscriptions: falta public.organizations. Aplica primero 0100_organizations_core (rename schools->organizations).';
  end if;

  if to_regclass('public.memberships') is null then
    raise exception
      '0500_subscriptions: falta public.memberships. Aplica primero 0100_organizations_core (rename school_users->memberships).';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_platform_admin'
  ) then
    raise exception
      '0500_subscriptions: falta public.is_platform_admin(). Aplica primero 0100_organizations_core.';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_org_role'
  ) then
    raise exception
      '0500_subscriptions: falta public.has_org_role(uuid,text). Aplica primero 0100_organizations_core.';
  end if;
end
$pre$;

-- ------------------------------------------------------------
-- 1. TABLA: subscriptions
-- ------------------------------------------------------------
create table if not exists public.subscriptions (
  id                          uuid primary key default gen_random_uuid(),

  -- Tenancy + identidad del cliente
  org_id                      uuid references public.organizations(id) on delete cascade,
  user_id                     uuid references auth.users(id) on delete set null,
  email                       text,

  -- Plan / precio
  plan                        text,
  price_id                    text,

  -- Estado del entitlement
  status                      text not null default 'active',

  -- Identificadores de Stripe (idempotencia via indices unicos parciales)
  stripe_customer_id          text,
  stripe_subscription_id      text,
  stripe_checkout_session_id  text,

  -- Ventana de vigencia (solo aplica a recurrentes; NULL en one-time)
  current_period_start        timestamptz,
  current_period_end          timestamptz,
  cancel_at_period_end        boolean not null default false,

  -- Importes
  amount_total                int,
  currency                    text not null default 'usd',

  -- Mode-agnostic: 'subscription' | 'one_time' | 'installments' | 'unknown'
  billing_mode                text not null default 'unknown',

  -- Payload crudo del evento Stripe (auditoria / reproceso)
  raw                         jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Columnas idempotentes (por si la tabla ya existia con menos columnas).
-- Nota: se anaden nullable; los NOT NULL del create-table de arriba aplican
-- solo en creacion fresca. En una tabla preexistente se respeta lo que haya
-- (no forzamos NOT NULL retro para no romper datos previos).
alter table public.subscriptions add column if not exists org_id                     uuid;
alter table public.subscriptions add column if not exists user_id                    uuid;
alter table public.subscriptions add column if not exists email                      text;
alter table public.subscriptions add column if not exists plan                       text;
alter table public.subscriptions add column if not exists price_id                   text;
alter table public.subscriptions add column if not exists status                     text;
alter table public.subscriptions add column if not exists stripe_customer_id         text;
alter table public.subscriptions add column if not exists stripe_subscription_id     text;
alter table public.subscriptions add column if not exists stripe_checkout_session_id text;
alter table public.subscriptions add column if not exists current_period_start       timestamptz;
alter table public.subscriptions add column if not exists current_period_end         timestamptz;
alter table public.subscriptions add column if not exists cancel_at_period_end       boolean;
alter table public.subscriptions add column if not exists amount_total               int;
alter table public.subscriptions add column if not exists currency                   text;
alter table public.subscriptions add column if not exists billing_mode               text;
alter table public.subscriptions add column if not exists raw                        jsonb;
alter table public.subscriptions add column if not exists created_at                 timestamptz;
alter table public.subscriptions add column if not exists updated_at                 timestamptz;

-- Defaults (idempotente)
alter table public.subscriptions alter column status               set default 'active';
alter table public.subscriptions alter column cancel_at_period_end set default false;
alter table public.subscriptions alter column currency             set default 'usd';
alter table public.subscriptions alter column billing_mode         set default 'unknown';
alter table public.subscriptions alter column raw                  set default '{}'::jsonb;
alter table public.subscriptions alter column created_at           set default now();
alter table public.subscriptions alter column updated_at           set default now();

comment on table  public.subscriptions is
  'Entitlements de Stripe por organizacion (mode-agnostic: recurrente, one-time o cuotas). Webhook idempotente via indices unicos parciales. Escritura solo service_role.';
comment on column public.subscriptions.billing_mode is
  'subscription | one_time | installments | unknown. El webhook lo resuelve; arranca en unknown.';
comment on column public.subscriptions.raw is
  'Payload crudo del evento Stripe para auditoria / reproceso.';

-- ------------------------------------------------------------
-- 2. INDICES
-- ------------------------------------------------------------
-- Idempotencia del webhook: un sub_id / session_id de Stripe = una sola fila.
-- Parciales (WHERE NOT NULL) para no colisionar entre las filas one-time
-- (sin subscription_id) ni entre las recurrentes (sin checkout_session_id).
create unique index if not exists subscriptions_stripe_subscription_id_uidx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists subscriptions_stripe_checkout_session_id_uidx
  on public.subscriptions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Indices de lookup para RLS / consultas frecuentes.
create index if not exists subscriptions_org_id_idx          on public.subscriptions (org_id);
create index if not exists subscriptions_user_id_idx         on public.subscriptions (user_id);
create index if not exists subscriptions_email_idx           on public.subscriptions (lower(email));
create index if not exists subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);
create index if not exists subscriptions_status_idx          on public.subscriptions (status);

-- ------------------------------------------------------------
-- 3. TRIGGER: updated_at automatico
-- ------------------------------------------------------------
create or replace function public.tg_subscriptions_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_subscriptions_set_updated_at();

-- ------------------------------------------------------------
-- 4. HELPER: has_active_entitlement(p_org, p_user)  (mode-agnostic)
-- ------------------------------------------------------------
-- Devuelve TRUE si el par (org, user) tiene un derecho de acceso vigente,
-- sin importar el modo de cobro:
--   * recurrente  -> status activo Y dentro de la ventana de periodo
--                    (o sin periodo definido todavia).
--   * one-time    -> status activo (no expira por periodo).
--   * cuotas      -> igual que recurrente si trae periodo; si no, activo.
-- SECURITY DEFINER + search_path fijo (convencion del proyecto): pensado
-- para llamarse desde RLS u otras funciones sin exponer la tabla.
-- NOTA: 'past_due' se trata como vigente (periodo de gracia). Endurece a
--   ('active','trialing') si el producto quiere corte inmediato.
create or replace function public.has_active_entitlement(p_org uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.org_id = p_org
      and s.user_id = p_user
      and s.status in ('active', 'trialing', 'past_due')
      and (
        -- one-time / sin ventana definida: vigente mientras status sea activo
        s.current_period_end is null
        -- recurrente / cuotas con ventana: aun no vencido
        or s.current_period_end >= now()
      )
  );
$$;

comment on function public.has_active_entitlement(uuid, uuid) is
  'Mode-agnostic: TRUE si (org_id,user_id) tiene entitlement vigente (recurrente, one-time o cuotas).';

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.subscriptions enable row level security;
-- Forzar RLS tambien al dueno de la tabla; el webhook usa service_role,
-- que sigue bypaseando RLS por diseno de Supabase.
alter table public.subscriptions force row level security;

-- Limpieza idempotente de policies previas (nombres actuales y heredados).
drop policy if exists "subscriptions: platform all"  on public.subscriptions;
drop policy if exists "subscriptions: owner org"     on public.subscriptions;
drop policy if exists "subscriptions: user own"      on public.subscriptions;

-- PLATFORM: super-admin (tabla platform_admins, via is_platform_admin())
-- ve y gestiona TODAS las suscripciones. Es la UNICA policy FOR ALL.
-- Reusa la misma autoridad que el resto del esquema (0100): no inventa un
-- segundo modelo basado en claims de JWT spoofeables.
create policy "subscriptions: platform all"
  on public.subscriptions
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- OWNER: el dueno (rol 'owner') ve las suscripciones de CADA organizacion
-- donde es owner. Multi-org por diseno: has_org_role(org_id,'owner') valida
-- la membresia fila-a-fila contra TODAS las orgs del user (no asume una sola
-- org activa), e incluye el escape de plataforma y una unica definicion de la
-- jerarquia de roles. Solo SELECT: los cobros NO se editan a mano desde el
-- cliente (solo el webhook con service_role).
-- org_id IS NOT NULL evita que una fila huerfana (org sin resolver) sea
-- visible para cualquier owner por un has_org_role(NULL,...) ambiguo.
create policy "subscriptions: owner org"
  on public.subscriptions
  for select
  using (
    org_id is not null
    and public.has_org_role(org_id, 'owner')
  );

-- USER: cada persona ve la SUYA, por user_id (preferente) o por email
-- VERIFICADO del JWT. Solo SELECT. Sin user_id ni email no hay match
-- (deny-by-default): una fila huerfana sin identidad no la ve nadie salvo
-- platform.
-- Seguridad del branch de email: se exige el claim 'email_verified' = true
-- del JWT de Supabase, para que un email no confirmado no de acceso a la
-- fila de cobro de otra persona con ese mismo email.
create policy "subscriptions: user own"
  on public.subscriptions
  for select
  using (
    (user_id is not null and user_id = auth.uid())
    or (
      email is not null
      and email <> ''
      and lower(email) = lower(coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'),
        ''
      ))
      and coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'),
        ''
      ) <> ''
      and coalesce(
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email_verified')::boolean,
        false
      )
    )
  );

commit;

-- ============================================================
-- DOWN-MIGRATION (rollback) — descomentar para revertir
-- ============================================================
-- begin;
--
--   -- Policies
--   drop policy if exists "subscriptions: platform all" on public.subscriptions;
--   drop policy if exists "subscriptions: owner org"    on public.subscriptions;
--   drop policy if exists "subscriptions: user own"     on public.subscriptions;
--
--   -- Trigger + su funcion
--   drop trigger  if exists subscriptions_set_updated_at on public.subscriptions;
--   drop function if exists public.tg_subscriptions_set_updated_at();
--
--   -- Tabla (los indices caen con ella)
--   drop table if exists public.subscriptions;
--
--   -- Helper de entitlement (creado por esta migracion).
--   -- NO se dropea is_platform_admin() ni has_org_role(): pertenecen a 0100.
--   drop function if exists public.has_active_entitlement(uuid, uuid);
--
-- commit;
-- ============================================================
