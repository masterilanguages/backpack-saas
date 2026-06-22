import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_PATHS = ["/dashboard", "/companies", "/website"];
const SESSION_COOKIE = "masteri-admin-session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "masteri2026";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (!isAdminPath) return NextResponse.next();

  const session = request.cookies.get(SESSION_COOKIE);
  if (session?.value === "authenticated") return NextResponse.next();

  // Redirect to login, preserving the intended destination
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/companies/:path*", "/website/:path*"],
};
