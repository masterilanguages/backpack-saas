import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase-ssr";

/**
 * Cierra la sesión Supabase (limpia las cookies sb-*) y redirige a /login.
 * 303 para que el navegador siga con un GET.
 *
 * IMPORTANTE: el redirect se arma con el header `Host` REAL del navegador
 * (ej. masteri.localhost:3102 / masteri.backpacksystems.com), NO con
 * request.url — que en dev reporta `localhost` y haría que el middleware
 * multi-tenant no resuelva el tenant (→ 404 en /login).
 */
export async function POST(request: NextRequest) {
  const supabase = serverClient();
  await supabase.auth.signOut();

  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = (request.headers.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return NextResponse.redirect(`${proto}://${host}/login`, { status: 303 });
}
