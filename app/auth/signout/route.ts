import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase-ssr";

/**
 * Signs the current user out (clears the Supabase session cookies) and sends
 * them back to /login. 303 so the browser follows with a GET.
 */
export async function POST(request: Request) {
  const supabase = serverClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
