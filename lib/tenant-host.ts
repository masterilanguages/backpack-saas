import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Helpers de tenant para superficies PÚBLICAS (sin sesión), donde el middleware
 * NO inyecta x-org-* (eso solo ocurre para miembros autenticados). Aquí el
 * tenant se deriva del Host de la petición, igual que en middleware.ts.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "backpacksystems.com";
const RESERVED = new Set(["www", "app", "api", "admin", "platform"]);

/** Host header -> slug de tenant (o null para apex/www/reservado/desconocido). */
export function slugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].trim().toLowerCase();
  if (!hostname) return null;

  // Dev local: slug.localhost
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length < 2) return null;
    const sub = parts[0];
    return RESERVED.has(sub) ? null : sub;
  }

  if (hostname === ROOT_DOMAIN) return null; // apex -> sin tenant
  const suffix = `.${ROOT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;
  if (RESERVED.has(sub)) return null;
  return sub;
}

export type Brand = { name: string; slug: string | null };

/**
 * Firma por-organización para las pantallas de auth: nombre real de la escuela
 * del subdominio. En apex/www (sin tenant) o si no se encuentra, cae a "Backpack".
 */
export async function getBrandFromHost(): Promise<Brand> {
  const h = await headers();
  const slug = slugFromHost(h.get("host"));
  if (!slug) return { name: "Backpack", slug: null };
  try {
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("slug", slug)
      .maybeSingle();
    const name = (data?.name as string | undefined)?.trim();
    return { name: name || "Backpack", slug };
  } catch {
    return { name: "Backpack", slug };
  }
}
