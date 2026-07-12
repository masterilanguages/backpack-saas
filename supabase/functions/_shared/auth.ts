// Shared auth helpers for Edge Functions.
//
// IMPORTANT: Supabase verifies that requests carry a valid project JWT, but the
// public anon key is itself a valid JWT. To protect paid integrations (LLM,
// image gen, email) from anyone holding the public anon key, we additionally
// require a real authenticated USER — getUser() returns null for an anon-key
// token but the actual user for a logged-in session.
import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { user: null as any };
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data } = await supabase.auth.getUser(token);
  return { user: data?.user ?? null };
}

export async function requireUser(req: Request) {
  const { user } = await getCaller(req);
  if (!user) return { ok: false as const, status: 401, error: "Not authenticated" };
  return { ok: true as const, user };
}

export async function requireAdmin(req: Request) {
  const { user } = await getCaller(req);
  if (!user) return { ok: false as const, status: 401, error: "Not authenticated" };
  const role = (user.app_metadata as any)?.user_role || "user";
  if (role !== "admin") return { ok: false as const, status: 403, error: "Admin only" };
  return { ok: true as const, user };
}
