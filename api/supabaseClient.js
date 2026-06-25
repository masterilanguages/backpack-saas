"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Cliente Supabase del NAVEGADOR para la capa portada del Learning Portal.
//
// ADAPTADO a la sesión de backpack: usa createBrowserClient de @supabase/ssr
// (en vez de un createClient plano de @supabase/supabase-js) para que la sesión
// viva en las cookies sb-* del documento — las MISMAS que lee middleware.ts y
// lib/supabase-ssr.ts. Así base44Client.js (que importa este `supabase`) hereda
// al usuario logueado y RLS aplica igual que en el resto de backpack.
//
// Mismas env que el resto del repo: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface a clear error during development if env vars are missing.
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.'
  );
}

// Singleton para el navegador: lee/escribe la sesión desde las cookies sb-*,
// compartidas con el middleware multi-tenant. Anon key + RLS.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export default supabase;
