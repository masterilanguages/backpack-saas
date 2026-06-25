import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase-ssr";

/**
 * OAuth / magic-link / password-recovery callback.
 * Exchanges the `code` returned by Supabase Auth for a session (cookies are
 * written by the SSR client), then redirects to `next` (default /dashboard).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = serverClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, origin));
}
