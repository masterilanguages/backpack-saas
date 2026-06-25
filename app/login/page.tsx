"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase-ssr";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = browserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    router.push(from);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

function BackpackLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="44" height="44" rx="10" fill="#1B2B4B"/>
      <path d="M17 16.5C17 14.567 18.567 13 20.5 13h3C25.433 13 27 14.567 27 16.5V17h1.5A2.5 2.5 0 0 1 31 19.5v13A2.5 2.5 0 0 1 28.5 35h-13A2.5 2.5 0 0 1 13 32.5v-13A2.5 2.5 0 0 1 15.5 17H17v-.5Z" stroke="white" strokeWidth="1.8" fill="none"/>
      <path d="M19 17h6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="18" y="23" width="8" height="1.8" rx="0.9" fill="white"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">

        {/* School brand */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">Masteri Languages</h1>

          {/* Powered by Backpack */}
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <span className="text-xs text-slate-500">Powered by</span>
            <BackpackLogo />
            <span className="text-xs font-semibold text-slate-400">Backpack</span>
          </div>
        </div>

        {/* Login card */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <p className="text-sm font-medium text-slate-500 mb-1">Your language learning system.</p>
          <h2 className="text-xl font-bold text-slate-900">Sign in to continue</h2>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-600">
          &copy; {new Date().getFullYear()} Backpack. All rights reserved.
        </p>
      </div>
    </div>
  );
}
