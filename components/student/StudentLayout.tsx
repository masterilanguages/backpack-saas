"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useStudyTime } from "@/hooks/useStudyTime";

// The student portal has no side menu anymore: the app IS the phone shell on
// /home (rendered inside an iPhone-style frame over a full dark backdrop),
// and every other screen is reached from the shell's bottom tabs / Account
// menu. Inner pages get a floating "← Home" pill so nobody is stranded.
export default function StudentLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Track active study time across the whole student portal. Only runs while
  // signed in; banks stints to `study_session` (read by the Dashboard + Progress).
  useStudyTime({ enabled: isAuthenticated });

  // Gate the whole student portal: once the initial Supabase auth check resolves,
  // an unauthenticated visitor is bounced to /login (carrying where they came
  // from). This also prevents the "empty pages" flash — without a session every
  // RLS-protected query returns nothing. The middleware already gates on the
  // server; this client gate keeps the UX (spinner + redirect) intact.
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      router.replace(`/login?from=${encodeURIComponent(pathname || "/home")}`);
    }
  }, [isLoadingAuth, isAuthenticated, pathname, router]);

  if (isLoadingAuth || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-teal-400" />
          {isLoadingAuth ? "Loading…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  const isHome = pathname === "/home";

  return (
    <div className="min-h-screen bg-slate-950">
      {!isHome && (
        <Link
          href="/home"
          className="fixed left-4 top-4 z-50 flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-lg backdrop-blur transition hover:border-teal-500 hover:text-white"
        >
          ← Home
        </Link>
      )}
      <main className={isHome ? "" : "px-4 py-6 sm:px-6 lg:px-8"}>
        <div className={isHome ? "" : "mx-auto w-full max-w-5xl pt-8"}>{children}</div>
      </main>
    </div>
  );
}
