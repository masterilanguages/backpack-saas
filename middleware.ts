import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Multi-tenant middleware for {slug}.backpacksystems.com  (MULTI-ORG)
 * ------------------------------------------------------------------
 * The tenant axis is derived from the user's `memberships`. A user may belong
 * to SEVERAL orgs; the SUBDOMAIN chooses the *active* one, and access requires
 * a membership IN THAT specific org (not "any org"). This mirrors the canonical
 * server helper getSessionOrgRole() in lib/supabase-ssr.ts: org + role are ALWAYS
 * re-derived against `memberships` by (org_id, user_id) — never from a JWT claim
 * or a client-supplied header.
 *
 * Responsibilities (in order):
 *  1. Parse the Host header -> tenant `slug` (reject reserved subdomains).
 *  2. Resolve the active `organization` for that slug via the cached RPC
 *     `resolve_org_by_slug` (the org chosen by the subdomain).
 *  3. Require an authenticated Supabase session (else -> /login).
 *  4. Require a `membership` IN THIS org for the current user (else -> 404,
 *     without revealing whether the org or the membership exists). The role is
 *     read straight from the `memberships` row for (org_id = active org,
 *     user_id = auth.uid()); a user's role in some OTHER org is irrelevant here.
 *  5. Portal gating by role:
 *        owner | admin | coach  -> ADMIN portal group
 *        student                -> LEARNING portal group
 *  6. Strip client-supplied x-org-id / x-user-role headers BEFORE setting
 *     the server-resolved values, so downstream (Server Components / Route
 *     Handlers) can only ever read trusted, middleware-set identity.
 *
 * Notes / assumptions:
 *  - Uses @supabase/ssr (must be added as a dependency).
 *  - `resolve_org_by_slug(p_slug text)` is a SECURITY DEFINER, STABLE RPC
 *    (set search_path = public, pg_temp; lives in 0100) that RETURNS the
 *    organizations row ({ id, slug, name, active }) or no rows. Being STABLE
 *    lets Postgres/PostgREST cache it within the request; we also short-cache
 *    the resolved slug->org in-process to spare repeated round-trips.
 *  - Membership is resolved by SELECTing the caller's `memberships` row for
 *    (org_id = active org, user_id = auth.uid()) under the anon client + RLS.
 *    RLS ("memberships: own org", scoped by my_org_ids()) lets a user read
 *    their OWN membership rows, so this returns the role only when the user is
 *    actually a member of the active org. Deriving it from the table (not a
 *    header, and scoped to THIS org) is what makes both the multi-org rule and
 *    the "do not reveal existence" guarantee hold.
 */

// ── Configuration ────────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "backpacksystems.com";

/** Subdomains that are NOT tenants. */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "platform",
]);

/** Roles allowed into the Admin portal group. */
const ADMIN_ROLES = new Set(["owner", "admin", "coach"]);
/** Roles allowed into the Learning portal group. */
const LEARNING_ROLES = new Set(["student"]);

/**
 * Path prefixes for each portal group. A request whose pathname starts with
 * one of these prefixes is gated to that group's allowed roles.
 *   - Admin portal: school operations (dashboard, students, courses…).
 *   - Learning portal: the student space (/u/:username, learning, journal…).
 * Anything not listed is "shared" (e.g. /login, /logout, /account) and is
 * reachable by any authenticated member of the org.
 */
const ADMIN_PORTAL_PREFIXES = [
  "/dashboard",
  "/companies",
  "/students",
  "/courses",
  "/coaches",
  "/lessons",
  "/team",
  "/leads",
  "/transactions",
  "/calendar",
  "/settings",
  "/analytics",
];
const LEARNING_PORTAL_PREFIXES = [
  "/u",
  "/learn",
  "/learning",
  "/journal",
  "/vocabulary",
  "/songs",
  "/practice",
  "/progress",
];

/** Public paths reachable WITHOUT a session (still scoped to a valid tenant). */
const PUBLIC_PATHS = new Set([
  "/login",
  "/auth/callback",
  "/auth/confirm",
  "/auth/reset",
  "/api/auth/forgot", // "olvidé mi contraseña": lo llama un usuario SIN sesión
]);

/** Default landing path per portal group, used to redirect after auth. */
const ADMIN_HOME = "/dashboard";
const LEARNING_HOME = "/learn";

// ── In-process slug -> org cache (cheap, request-bursty, short TTL) ───────────
// Per-instance only; real caching authority is the STABLE RPC. Keeps a single
// browser navigation burst from hammering the DB. Negative results cached too
// (shorter) so a flood to an unknown slug doesn't repeatedly hit the RPC.

type Org = {
  id: string;
  slug: string;
  name: string | null;
  active: boolean | null;
};

type CacheEntry = { org: Org | null; expires: number };
const ORG_CACHE = new Map<string, CacheEntry>();
const ORG_TTL_MS = 60_000; // 1 min for hits
const ORG_NEG_TTL_MS = 10_000; // 10 s for misses

function cacheGet(slug: string): CacheEntry | undefined {
  const hit = ORG_CACHE.get(slug);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    ORG_CACHE.delete(slug);
    return undefined;
  }
  return hit;
}

function cacheSet(slug: string, org: Org | null) {
  ORG_CACHE.set(slug, {
    org,
    expires: Date.now() + (org ? ORG_TTL_MS : ORG_NEG_TTL_MS),
  });
}

// ── Host -> slug parsing ─────────────────────────────────────────────────────

/**
 * Extract the tenant slug from the request host.
 * Returns:
 *   - string slug      -> a candidate tenant subdomain
 *   - null             -> apex / www / unknown shape (not a tenant host)
 *   - "__reserved__"   -> a reserved, non-tenant subdomain
 */
function parseSlug(host: string | null): string | null | "__reserved__" {
  if (!host) return null;

  // Strip port and normalize.
  const hostname = host.split(":")[0].trim().toLowerCase();
  if (!hostname) return null;

  // Local dev: support `slug.localhost` and bare `localhost`.
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length < 2) return null; // bare localhost -> no tenant
    const sub = parts[0];
    return RESERVED_SUBDOMAINS.has(sub) ? "__reserved__" : sub;
  }

  // Must be a subdomain of the configured root domain.
  if (hostname === ROOT_DOMAIN) return null; // apex -> no tenant
  const suffix = `.${ROOT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return null; // unrelated host

  const sub = hostname.slice(0, -suffix.length);
  // Only accept a single-label subdomain (e.g. "masteri", not "a.b").
  if (!sub || sub.includes(".")) return null;

  if (RESERVED_SUBDOMAINS.has(sub)) return "__reserved__";
  return sub;
}

// ── Responses ────────────────────────────────────────────────────────────────

/**
 * "Not found" used for: unknown/inactive org, AND missing membership.
 * Using the SAME 404 for both makes the two cases indistinguishable, so we
 * never reveal whether an org (or a membership in it) exists.
 */
function notFound(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/404";
  // 404 status with a rewrite to the app's not-found UI.
  return NextResponse.rewrite(url, { status: 404 });
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // Preserve intended destination so we can bounce back after auth.
  url.searchParams.set("from", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 0. Build a request whose headers have any client-supplied identity
  //        headers REMOVED. We start from this stripped baseline for every
  //        downstream request so a client can never spoof x-org-id /
  //        x-user-role. We only ever set them ourselves, later.
  const cleanHeaders = new Headers(request.headers);
  cleanHeaders.delete("x-org-id");
  cleanHeaders.delete("x-org-slug");
  cleanHeaders.delete("x-user-id");
  cleanHeaders.delete("x-user-role");

  // ── 1. Host -> slug
  const slug = parseSlug(request.headers.get("host"));

  // Host NO-tenant (apex backpacksystems.com / www / subdominio reservado):
  // es la superficie de MARKETING del producto, no una app de tenant. Se deja
  // pasar para que renderice normal (app/page.tsx, etc.) en vez de 404. El
  // gating multi-tenant SOLO aplica a {slug}.backpacksystems.com.
  if (slug === "__reserved__" || slug === null) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  // ── Supabase SSR client wired to this request's cookies.
  // `supabaseResponse` accumulates refreshed-session Set-Cookie headers and is
  // the object we ultimately return (or copy cookies from). It is rebuilt with
  // `cleanHeaders` so the stripped headers flow downstream.
  let supabaseResponse = NextResponse.next({ request: { headers: cleanHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: cleanHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ── 2. Resolve org by slug (cached RPC + in-process short cache).
  let org: Org | null;
  const cached = cacheGet(slug);
  if (cached) {
    org = cached.org;
  } else {
    const { data, error } = await supabase
      .rpc("resolve_org_by_slug", { p_slug: slug })
      .maybeSingle<Org>();
    // On RPC error, fail closed (treat as unknown tenant) but do NOT cache.
    org = error ? null : (data ?? null);
    if (!error) cacheSet(slug, org);
  }

  // Unknown or inactive org -> 404 (same response as missing membership).
  if (!org || org.active === false) {
    return notFound(request);
  }

  // ── 3. Require a Supabase session.
  // getUser() validates the JWT with the auth server (revalidates/refreshes).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (!user) {
    // Allow unauthenticated access only to the explicit public paths of a
    // valid tenant (e.g. its /login). Everything else -> /login.
    if (isPublicPath) {
      return withCookies(supabaseResponse, NextResponse.next({ request: { headers: cleanHeaders } }));
    }
    return withCookies(supabaseResponse, redirectToLogin(request));
  }

  // ── 4. Require membership IN THIS org (the subdomain-chosen active org).
  //        MULTI-ORG: a user may be a member of several orgs; we read ONLY the
  //        row for (org_id = this org, user_id = current user), so a role in a
  //        DIFFERENT org never grants access here. Derived from the table under
  //        the anon client + RLS (RLS lets a user read their own membership),
  //        not from a header/claim — so a non-member cannot tell a missing org
  //        from a forbidden one.
  const { data: membership, error: memErr } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle<{ role: string }>();

  const role = memErr ? null : membership?.role ?? null;

  if (!role) {
    // Authenticated, but not a member of this tenant.
    // 404 (not 403) so we never confirm the tenant exists to outsiders.
    return withCookies(supabaseResponse, notFound(request));
  }

  // A logged-in member hitting /login OR the tenant root "/" -> send them to
  // their portal home BY ROLE. On a tenant subdomain the index page is the
  // product's marketing surface (built for the apex), so an authenticated
  // member should never land there: route students to /learn and staff to
  // /dashboard. This also fixes the post-login bounce when `from=/`.
  if ((isPublicPath && pathname === "/login") || pathname === "/") {
    const home = LEARNING_ROLES.has(role) ? LEARNING_HOME : ADMIN_HOME;
    return withCookies(supabaseResponse, redirectTo(request, home));
  }

  // ── 5. Portal gating by role.
  const wantsAdmin = ADMIN_PORTAL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const wantsLearning = LEARNING_PORTAL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (wantsAdmin && !ADMIN_ROLES.has(role)) {
    // e.g. a student trying to reach /dashboard -> bounce to learning home.
    return withCookies(supabaseResponse, redirectTo(request, LEARNING_HOME));
  }
  if (wantsLearning && !LEARNING_ROLES.has(role)) {
    // e.g. an admin/coach trying to reach /learn -> bounce to admin home.
    return withCookies(supabaseResponse, redirectTo(request, ADMIN_HOME));
  }

  // ── 6. Set the trusted, server-resolved identity headers on the (already
  //        stripped) downstream request, then return.
  cleanHeaders.set("x-org-id", org.id);
  cleanHeaders.set("x-org-slug", org.slug);
  cleanHeaders.set("x-user-id", user.id);
  cleanHeaders.set("x-user-role", role);

  const response = NextResponse.next({ request: { headers: cleanHeaders } });
  return withCookies(supabaseResponse, response);
}

/**
 * Copy any session Set-Cookie headers accumulated by the Supabase SSR client
 * onto the final response we hand back, so token refreshes are persisted no
 * matter which branch returns.
 */
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

// ── Matcher: everything EXCEPT static assets & framework internals ───────────
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static, _next/image  (build assets / image optimizer)
     *  - favicon.ico, robots.txt, sitemap.xml
     *  - any path ending in a common static asset extension
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|txt)$).*)",
  ],
};
