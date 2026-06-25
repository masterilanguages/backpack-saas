/**
 * lib/supabase-browser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente Supabase para el NAVEGADOR (Client Components "use client").
 *
 * Vive en su PROPIO módulo —separado de lib/supabase-ssr.ts— a propósito:
 * supabase-ssr.ts importa `next/headers` (para serverClient/serviceClient), y
 * `next/headers` es SOLO-servidor. Si un Client Component importara browserClient
 * desde ese módulo, el bundler arrastraría `next/headers` al bundle cliente y
 * Next lo rechazaría ("You're importing a component that needs next/headers").
 *
 * Aquí NO se importa nada server-only: solo createBrowserClient de @supabase/ssr.
 * Anon key + RLS, sesión persistida en cookies sb-* del documento (legibles por
 * el middleware server-side).
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cliente para el navegador. Anon key + RLS. Lee/escribe la sesión desde las
 * cookies del documento. Usar dentro de componentes "use client".
 */
export function browserClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "[supabase-browser] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Revísalas en .env.local / Vercel project settings.",
    );
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
