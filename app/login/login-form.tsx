"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";

type Mode = "signin" | "forgot" | "signup";

const inputCls =
  "w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";
const primaryBtn =
  "w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60";

function Inner({ canSignup }: { canSignup: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");

  // sign in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // forgot
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // sign up
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suError, setSuError] = useState("");
  const [suLoading, setSuLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  // Default neutro al rol: "/" deja que el middleware enrute por rol
  // (alumno -> /learn, staff -> /dashboard) en un solo salto.
  const from = searchParams.get("from") ?? "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = browserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Email o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    // En el apex/www (backpacksystems.com) NO hay tenant: si quien entra es
    // platform-admin, mándalo a su consola en vez de dejarlo en el marketing.
    const host = window.location.hostname;
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "backpacksystems.com";
    const isApex = host === root || host === `www.${root}` || host === "localhost";
    if (isApex && (from === "/" || from === "")) {
      const res = await fetch("/api/platform/schools").catch(() => null);
      if (res && res.ok) {
        router.push("/platform/schools");
        router.refresh();
        return;
      }
    }

    router.push(from);
    router.refresh();
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, origin: window.location.origin }),
    }).catch(() => {});
    setForgotLoading(false);
    setForgotSent(true); // siempre confirmamos (no revelar si el email existe)
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuError("");
    if (suPassword.length < 8) {
      setSuError("Password must be at least 8 characters.");
      return;
    }
    setSuLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: suName, email: suEmail, password: suPassword }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setSuError(d.error ?? "Could not create your account. Please try again.");
      setSuLoading(false);
      return;
    }

    // Auto sign-in con la contraseña recién elegida.
    const supabase = browserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: suEmail,
      password: suPassword,
    });
    setSuLoading(false);

    if (signInError) {
      // Cuenta creada pero el auto-login falló: que inicie sesión manualmente.
      setEmail(suEmail);
      setMode("signin");
      setError("Account created. Please sign in.");
      return;
    }
    router.push("/"); // el middleware enruta al alumno a /learn
    router.refresh();
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  if (mode === "forgot") {
    return (
      <div>
        <h2 className="text-xl font-bold text-slate-900">Reset your password</h2>
        <div className="mt-6">
          {forgotSent ? (
            <div className="text-center">
              <p className="text-sm font-medium text-emerald-600">✓ Check your email</p>
              <p className="mt-2 text-sm text-slate-500">
                If an account exists for that email, we sent a reset link.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setForgotSent(false);
                }}
                className="mt-4 text-sm font-medium text-teal-600 hover:text-teal-700"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-slate-500">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" disabled={forgotLoading} className={primaryBtn}>
                {forgotLoading ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Sign up (auto-registro de alumno) ──────────────────────────────────────
  if (mode === "signup") {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-slate-500">Start learning today.</p>
        <h2 className="text-xl font-bold text-slate-900">Create your account</h2>
        <form onSubmit={handleSignup} className="mt-6 space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              autoFocus
              value={suName}
              onChange={(e) => setSuName(e.target.value)}
              className={inputCls}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              required
              value={suEmail}
              onChange={(e) => setSuEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <input
              type="password"
              required
              value={suPassword}
              onChange={(e) => setSuPassword(e.target.value)}
              className={inputCls}
              placeholder="At least 8 characters"
            />
          </div>
          {suError && <p className="text-xs text-red-500">{suError}</p>}
          <button type="submit" disabled={suLoading} className={primaryBtn}>
            {suLoading ? "Creating…" : "Create account"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setSuError("");
            }}
            className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Already have an account? Sign in
          </button>
        </form>
      </div>
    );
  }

  // ── Sign in ────────────────────────────────────────────────────────────────
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-500">Your language learning system.</p>
      <h2 className="text-xl font-bold text-slate-900">Sign in to continue</h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className={labelCls}>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? "Checking…" : "Enter"}
        </button>
        <button
          type="button"
          onClick={() => setMode("forgot")}
          className="w-full text-center text-xs font-medium text-slate-500 transition hover:text-slate-700"
        >
          Forgot password?
        </button>
      </form>

      {canSignup && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className="font-semibold text-teal-600 hover:text-teal-700"
          >
            Create one
          </button>
        </p>
      )}
    </div>
  );
}

export default function LoginForm({ canSignup }: { canSignup: boolean }) {
  return (
    <Suspense fallback={null}>
      <Inner canSignup={canSignup} />
    </Suspense>
  );
}
