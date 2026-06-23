import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client — use in components
export const supabase = createClient(URL, ANON);

// Server client — bypasses RLS, use in API routes only
export const supabaseAdmin = createClient(URL, SERVICE);
