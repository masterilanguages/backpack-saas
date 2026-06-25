import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase-ssr";

/**
 * Callback de OAuth / magic-link / recuperación de contraseña.
 * Intercambia el `code` que devuelve Supabase Auth por una sesión (las cookies
 * sb-* las escribe el cliente SSR), y luego redirige a `next` (default /dashboard).
 *
 * El redirect usa el header `Host` REAL del navegador (subdominio de tenant),
 * NO request.url (que en dev reporta `localhost` → rompería la resolución de
 * tenant en el middleware multi-tenant).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = serverClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = (request.headers.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return NextResponse.redirect(`${proto}://${host}${next.startsWith("/") ? next : "/" + next}`);
}
