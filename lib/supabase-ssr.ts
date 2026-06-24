/**
 * lib/supabase-ssr.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Clientes Supabase basados en @supabase/ssr para Next.js 14 App Router.
 *
 * Reemplaza el antiguo `lib/supabase.ts` (createClient anon/service plano) con
 * clientes que entienden cookies y sesión:
 *
 *   - browserClient()    → Client Components ("use client"). Anon + RLS.
 *   - serverClient()     → Server Components / Route Handlers / Server Actions.
 *                          Anon + RLS, ligado a las cookies de la petición
 *                          (lee la sesión del usuario logueado).
 *   - middlewareClient() → middleware.ts. Refresca la sesión y reescribe cookies.
 *   - serviceClient()    → SOLO server, bypassa RLS (service_role). Webhooks,
 *                          alta automática post-Stripe, jobs de plataforma.
 *
 *   - getSessionOrgRole(slug) → server-side. Devuelve { userId, orgId, role }
 *                          DERIVADO de las `memberships` del usuario (auth.uid())
 *                          FILTRADAS por el slug de la org activa. Multi-org: un
 *                          usuario puede pertenecer a varias orgs; el slug activo
 *                          (subdominio) selecciona CUÁL de sus membresías aplica,
 *                          y el rol sale de ESA fila. NUNCA confía en claims/JWT:
 *                          siempre re-deriva contra la tabla. Es la pieza que
 *                          aísla cada tenant en el Admin Portal.
 *
 *   - base44Client        → shim de compatibilidad para el Learning Portal
 *                          (que asume un cliente anon + RLS estilo Base44).
 *                          Apunta al serverClient() bajo el capó.
 *
 * IMPORTANTE — esquema multi-tenant (decisiones oficiales):
 *   - `schools`      → renombrada a `organizations`
 *   - `school_users` → renombrada a `memberships`
 *   - `school_id`    → renombrada a `org_id`
 *   memberships(role) ∈ owner | admin | coach | student, unique(org_id,user_id),
 *   multi-org permitido. Este archivo asume el esquema YA renombrado (el mismo
 *   estado destino que las migraciones de backpack-saas/supabase/migrations).
 *
 * SEGURIDAD: las cookies de sesión son la única fuente de identidad. El org/rol
 * SIEMPRE se deriva de `memberships` en el servidor — el cliente no puede
 * inyectar un org_id ni un rol elevado.
 */

import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Solo presente en el servidor; nunca exponer al cliente.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[supabase-ssr] Falta la variable de entorno ${name}. ` +
        `Revísala en .env.local / Vercel project settings.`,
    );
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/** Roles válidos de una membresía (memberships.role CHECK). */
export type MembershipRole = "owner" | "admin" | "coach" | "student";

/**
 * Identidad efectiva del usuario DENTRO de una organización concreta.
 * Derivada server-side de `memberships` (nunca de claims del JWT).
 */
export interface SessionOrgRole {
  /** auth.users.id del usuario autenticado. */
  userId: string;
  /** organizations.id de la org activa (resuelta por slug). */
  orgId: string;
  /** Rol del usuario en esa org. */
  role: MembershipRole;
  /** Email del usuario (ownership de filas personales = created_by email). */
  email: string;
  /** slug de la organización activa (echo del input, ya validado). */
  slug: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser client (Client Components)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente para el navegador. Anon key + RLS. Lee/escribe la sesión desde las
 * cookies del documento. Usar dentro de componentes "use client".
 *
 * Es seguro crear uno por render: @supabase/ssr deduplica internamente la
 * conexión por cookies del documento.
 */
export function browserClient(): SupabaseClient {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server client (Server Components / Route Handlers / Server Actions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente server-side ligado a las cookies de la petición (Next 14 App Router).
 * Anon key + RLS: actúa COMO el usuario logueado. Devuelve datos filtrados por
 * RLS según la sesión real.
 *
 * Nota Next 14: `cookies()` es de solo-lectura en Server Components; la escritura
 * de cookies (refresh de token) solo funciona en Route Handlers / Server Actions
 * / middleware. Por eso `set`/`remove` envuelven en try/catch para no romper en
 * el contexto de render de un Server Component.
 */
export function serverClient(): SupabaseClient {
  const cookieStore = cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component render: cookies() es read-only. El refresh real
            // de la sesión ocurre en el middleware. Ignorar de forma segura.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Igual que arriba: no-op en contexto read-only.
          }
        },
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware client (middleware.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente para `middleware.ts`. Refresca el token de sesión y propaga las
 * cookies actualizadas a la respuesta. Devolver SIEMPRE el `response` que esta
 * función ha mutado (no crear uno nuevo después).
 *
 * Uso típico:
 *
 *   import { NextResponse } from "next/server";
 *   import { middlewareClient } from "@/lib/supabase-ssr";
 *
 *   export async function middleware(request: NextRequest) {
 *     const response = NextResponse.next({ request });
 *     const supabase = middlewareClient(request, response);
 *     await supabase.auth.getUser(); // fuerza el refresh + reescritura de cookies
 *     return response;
 *   }
 */
export function middlewareClient(
  request: NextRequest,
  response: NextResponse,
): SupabaseClient {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Escribir tanto en la request (para handlers posteriores en la
          // cadena) como en la response (para que el navegador la persista).
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Service client (service_role — BYPASSA RLS, solo server)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cliente con service_role: IGNORA RLS. Usar SOLO en server (webhooks de Stripe,
 * alta automática de usuarios/membresías, jobs de plataforma super-admin).
 * NUNCA importar desde un Client Component.
 *
 * Para operaciones normales del Admin/Learning Portal usar serverClient()
 * (anon + RLS), no este.
 */
export function serviceClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "[supabase-ssr] serviceClient() no puede usarse en el navegador: " +
        "expondría la service_role key. Úsalo solo en código server.",
    );
  }
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getSessionOrgRole(slug) — derivación de tenant + rol (NUNCA desde claims)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve la identidad efectiva del usuario logueado DENTRO de la organización
 * identificada por `slug`. Server-side. Multi-org. Pasos:
 *
 *   1. Lee la sesión real desde cookies vía `auth.getUser()` (valida el JWT
 *      contra Supabase Auth — no confía en el token sin verificar).
 *   2. DERIVA de las `memberships` del usuario (user_id = auth.uid()) la fila
 *      cuya organización tiene ese `slug` y está activa. El usuario puede
 *      pertenecer a varias orgs (multi-org): el slug activo (subdominio)
 *      selecciona CUÁL membresía aplica. El { orgId, role } sale de ESA fila;
 *      jamás del JWT. Una sola query embebe organizations vía la FK org_id, de
 *      modo que la org y la membresía se filtran juntas por el slug activo.
 *
 * Si el usuario no está logueado, la org no existe/no está activa, o el usuario
 * no tiene membresía en esa org concreta → devuelve `null` (el caller decide:
 * 401 / 403 / redirect a login).
 *
 * Esto es el corazón del aislamiento multi-tenant del Admin Portal: el cliente
 * jamás puede declarar su propio org_id ni su rol; ambos se re-derivan aquí a
 * partir de las membresías reales del usuario, acotadas al slug activo.
 *
 * @param slug  slug de la organización activa (p. ej. "masteri").
 * @param client  cliente opcional (anon+cookies). Por defecto serverClient().
 *                Inyectable en Route Handlers que ya tienen un cliente.
 */
export async function getSessionOrgRole(
  slug: string,
  client?: SupabaseClient,
): Promise<SessionOrgRole | null> {
  if (!slug) return null;

  const supabase = client ?? serverClient();

  // (1) Identidad verificada. getUser() valida el token contra el servidor de
  //     Auth; NO usamos getSession() (que confía en el JWT local sin verificar).
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  // (2) Derivación multi-org: arranca de las membresías del usuario y FILTRA por
  //     el slug activo embebiendo la org vía la FK org_id. Un inner join (no
  //     `!left`) descarta automáticamente la fila si la org no existe, no está
  //     activa o su slug no coincide. El rol viene de la membresía; org_id/slug
  //     de la org embebida. RLS de memberships debe permitir al usuario leer sus
  //     propias filas; RLS de organizations, leer las orgs en las que milita.
  const { data: membership, error: memError } = await supabase
    .from("memberships")
    .select("role, org_id, organizations!inner ( id, slug, active )")
    .eq("user_id", user.id)
    .eq("organizations.slug", slug)
    .eq("organizations.active", true)
    .maybeSingle();

  if (memError || !membership) return null;

  // El embed puede tiparse como objeto o array según la inferencia; normalizar.
  const orgEmbed = membership.organizations as
    | { id: string; slug: string; active: boolean }
    | { id: string; slug: string; active: boolean }[]
    | null;
  const org = Array.isArray(orgEmbed) ? orgEmbed[0] : orgEmbed;

  if (!org) return null;

  return {
    userId: user.id,
    orgId: (org.id ?? membership.org_id) as string,
    role: membership.role as MembershipRole,
    email: user.email ?? "",
    slug: org.slug as string,
  };
}

/**
 * Igual que getSessionOrgRole pero exige que el rol esté en `allowed`.
 * Atajo para guards de Route Handlers / Server Components del Admin Portal.
 *
 *   const ctx = await requireOrgRole(slug, ["owner", "admin"]);
 *   if (!ctx) return new Response("Forbidden", { status: 403 });
 */
export async function requireOrgRole(
  slug: string,
  allowed: MembershipRole[],
  client?: SupabaseClient,
): Promise<SessionOrgRole | null> {
  const ctx = await getSessionOrgRole(slug, client);
  if (!ctx) return null;
  return allowed.includes(ctx.role) ? ctx : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// base44Client — shim de compatibilidad para el Learning Portal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El Learning Portal (migrado de Base44) asume un cliente Supabase anon + RLS.
 * Este shim preserva ese contrato apuntando al serverClient() (cookies + RLS):
 * el portal sigue operando como cliente anon — los datos personales se filtran
 * por RLS vía app_email()/app_role() + created_by, ahora con el eje org_id
 * añadido por las migraciones multi-tenant.
 *
 * NO usa service_role: mantener anon + RLS es justamente lo que hace seguro al
 * portal en producción. Para el navegador, usar `browserBase44Client`.
 *
 * @returns un SupabaseClient anon ligado a la sesión server-side.
 */
export function base44Client(): SupabaseClient {
  return serverClient();
}

/**
 * Variante browser del shim base44 (Client Components del Learning Portal).
 * Anon + RLS, sesión desde cookies del documento.
 */
export function browserBase44Client(): SupabaseClient {
  return browserClient();
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilidad con el antiguo lib/supabase.ts
// ─────────────────────────────────────────────────────────────────────────────
//
// El código existente importa { supabase } y { supabaseAdmin } desde
// "@/lib/supabase". Para una migración sin roturas se re-exportan equivalentes:
//
//   - `supabaseAdmin`  → service_role (idéntico al anterior; bypassa RLS).
//
// Se exporta como getter perezoso para no instanciar el cliente service_role
// (ni exigir su env var) hasta que realmente se use desde el servidor.
//
// NOTA: el antiguo `supabase` (browser anon plano, módulo singleton) NO se
// re-exporta como singleton a propósito: en App Router el cliente debe crearse
// por contexto (cookies de la petición). Migrar esos call-sites a
// browserClient() / serverClient(). Si se necesita un puente temporal, usar
// `legacyAnonClient()`.

let _admin: SupabaseClient | null = null;

/**
 * Equivalente al antiguo `supabaseAdmin` (service_role, bypassa RLS). Solo
 * server. Memoizado por módulo.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!_admin) _admin = serviceClient();
    return Reflect.get(_admin, prop, receiver);
  },
});

/**
 * Puente temporal para call-sites que aún importan el antiguo `supabase`
 * (browser anon plano). Prefiere serverClient()/browserClient() según contexto.
 * No memoiza la sesión por cookies de petición, así que NO usar para datos
 * sensibles a la sesión.
 */
export function legacyAnonClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
  );
}
