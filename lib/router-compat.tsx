"use client";

/**
 * react-router-dom compatibility shim for Next.js App Router.
 *
 * The ported Base44 portal code imports `useNavigate`, `useLocation`,
 * `useParams`, `Link`, and `createPageUrl` from react-router. This module
 * re-exports Next-native equivalents under the same names so that code can be
 * ported with minimal edits.
 *
 * Page-URL convention (backpack):
 *   The Vite origin used `createPageUrl(name) => '/' + name.toLowerCase().replace(/ /g, '-')`
 *   (e.g. "Home" -> "/home"). In backpack the learning routes live at the ROOT
 *   (/learn, /journal, /home, …) WITHOUT a /portal prefix — the multi-tenant
 *   middleware gates them by subdomain + membership — so this table maps each
 *   Base44 page name straight to its real root route.
 */

import NextLink from "next/link";
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams as useNextParams,
} from "next/navigation";
import React from "react";

// Base44 page name (lowercased) -> real route. The migration moved pages into a
// nested IA (songs/singing/lessons under /learn, etc.), so the origin's naive
// "name -> /<slug>" no longer holds. This table is the single source of truth
// for cross-page navigation; unmapped names fall back to slug.
const PAGE_ROUTES: Record<string, string> = {
  // dashboard
  home: "/home",
  dashboard: "/home",
  myprogram: "/home/my-program",
  fluentpath: "/home/fluent-path",
  level1world: "/home/level1-world",
  // learn / video transcription
  learn: "/learn",
  videos: "/learn",
  // songs / singing
  songs: "/learn/songs",
  songlistenpage: "/learn/songs/listen",
  singinghome: "/learn/singing",
  singinglesson: "/learn/singing/lesson",
  // lessons
  lessons: "/learn/lessons",
  bodypartslesson: "/learn/lessons/body-parts",
  colorslesson: "/learn/lessons/colors",
  colorstest: "/learn/lessons/colors-test",
  dayslesson: "/learn/lessons/days-lesson",
  days: "/learn/lessons/days",
  monthslesson: "/learn/lessons/months",
  pictures: "/learn/lessons/pictures",
  pictureslesson2: "/learn/lessons/pictures2",
  sentences: "/learn/lessons/sentences",
  // practice / speaking
  practice: "/practice",
  speakingsession: "/practice",
  speakaudio: "/practice/speak-audio",
  dictationexercise: "/practice/dictation",
  sessionflow: "/practice/session-flow",
  // backpack / vocab (live at /library)
  backpack: "/library",
  wordbank: "/library",
  wordsiknow: "/library",
  flashcards: "/library/flashcards",
  // media library (the Base44 "Library"/"MediaLibrary" pages live at /media)
  library: "/media",
  medialibrary: "/media",
  babyvideos: "/media/baby",
  // journal
  journal: "/journal",
  session1journal: "/journal/session1",
  // progress / store
  progress: "/progress",
  store: "/progress/store",
  // onboarding
  languageselect: "/onboarding/language",
  avatarselect: "/onboarding/avatar",
};

// Resolve a react-router-style target (bare "Name", "/Name", "Name?q=1", or an
// already-real path) into the correct Next href.
function resolveHref(to: string): string {
  if (!to) return "/home";
  // Split off query/hash so it survives the mapping.
  const qIndex = to.search(/[?#]/);
  const pathPart = qIndex >= 0 ? to.slice(0, qIndex) : to;
  const suffix = qIndex >= 0 ? to.slice(qIndex) : "";

  const key = pathPart.replace(/^\//, "").replace(/^portal\//, "").toLowerCase();

  // Known Base44 page name (whether passed bare or as "/Name").
  if (PAGE_ROUTES[key]) return PAGE_ROUTES[key] + suffix;

  // Other absolute paths (e.g. "/login", "/u/...") -> leave untouched.
  if (pathPart.startsWith("/")) return to;

  // Bare unknown name -> origin's naive slug at the root.
  return "/" + key.replace(/ /g, "-") + suffix;
}

// createPageUrl(name) -> real href (table-mapped, query-preserving).
export function createPageUrl(name: string): string {
  return resolveHref(String(name || ""));
}

// useNavigate() -> (to, opts?) => void. Routes every target through the same
// resolver so cross-page links land on the real nested routes.
export function useNavigate() {
  const router = useRouter();
  return (to: string, opts?: { replace?: boolean }) => {
    const href = resolveHref(to);
    if (opts?.replace) {
      router.replace(href);
    } else {
      router.push(href);
    }
  };
}

// useLocation() -> { pathname, search }
export function useLocation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return {
    pathname: pathname || "",
    search: search ? `?${search}` : "",
  };
}

// useParams() -> route params object (Next provides this for dynamic segments).
export function useParams() {
  return (useNextParams() as Record<string, string>) || {};
}

// Link — wraps next/link but accepts react-router's `to` prop (and `href`).
type LinkProps = Omit<
  React.ComponentProps<typeof NextLink>,
  "href"
> & {
  to?: string;
  href?: string;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  function Link({ to, href, ...rest }, ref) {
    const target = to ?? href ?? "#";
    return <NextLink ref={ref} href={target} {...rest} />;
  }
);
