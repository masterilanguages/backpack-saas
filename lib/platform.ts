/**
 * lib/platform.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autoridad de PLATAFORMA (super-admin) para las superficies que NO pertenecen a
 * un tenant: el panel de alta de escuelas, jobs globales, etc.
 *
 * FUENTE DE VERDAD = la tabla public.platform_admins + el helper
 * is_platform_admin() (definidos en 0100_organizations_core). NO se usa un claim
 * de JWT (seria spoofeable): la pertenencia se deriva server-side contra la BD.
 * La policy "platform_admins: self or admin read" permite a cada usuario LEER su
 * propia fila bajo RLS, asi que el chequeo funciona con el cliente anon+cookies
 * (serverClient) sin exponer service_role.
 *
 * Server-only: importa serverClient (que usa next/headers). No importar desde un
 * Client Component ni desde el motor PURO de provisioning.
 */

import type { User } from "@supabase/supabase-js";
import { serverClient } from "./supabase-ssr";

/**
 * Devuelve el usuario de la sesion SOLO si es platform admin; si no, null.
 *
 * Pasos:
 *   1. auth.getUser() valida el JWT contra el servidor de Auth (no confia en el
 *      token local). Sin sesion -> null.
 *   2. Lee su propia fila en platform_admins (RLS self-read). Si existe, es
 *      platform admin -> devuelve el user; si no -> null.
 *
 * Uso (gate server-side en Route Handlers / Server Components):
 *   const user = await requirePlatformAdmin();
 *   if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */
export async function requirePlatformAdmin(): Promise<User | null> {
  const supabase = serverClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return user;
}
