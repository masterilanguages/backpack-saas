"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false); // hay sesión de recuperación válida
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const sb = browserClient();
    let cancelled = false;
    (async () => {
      // El enlace de recovery devuelve la sesión en el HASH del URL
      // (#access_token=...&refresh_token=...&type=recovery). El client
      // @supabase/ssr (PKCE) NO lo procesa solo, así que lo establecemos a mano.
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const p = new URLSearchParams(hash);
        const access_token = p.get("access_token");
        const refresh_token = p.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await sb.auth.setSession({ access_token, refresh_token });
          if (!cancelled) {
            setReady(!error);
            setChecking(false);
            // quitamos el token del URL (no dejarlo a la vista / en el historial)
            window.history.replaceState(null, "", window.location.pathname);
          }
          return;
        }
      }
      // Fallback: ¿ya hay sesión? (o un ?code= PKCE que el client haya manejado)
      const { data } = await sb.auth.getSession();
      if (!cancelled) {
        setReady(Boolean(data.session));
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pw !== pw2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    const sb = browserClient();
    const { error } = await sb.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) {
      setErr("No se pudo actualizar la contraseña. El enlace pudo haber expirado.");
    } else {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">Reset your password</h1>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          {done ? (
            <div className="text-center">
              <p className="text-sm font-medium text-emerald-600">✓ Password updated.</p>
              <p className="mt-2 text-sm text-slate-500">Redirecting to sign in…</p>
            </div>
          ) : checking ? (
            <p className="text-center text-sm text-slate-500">Checking your link…</p>
          ) : !ready ? (
            <div className="text-center">
              <p className="text-sm text-slate-700">This reset link is invalid or has expired.</p>
              <a href="/login" className="mt-3 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
                Back to sign in
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-slate-500">Choose a new password for your account.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">New password</label>
                <input
                  type="password"
                  required
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Confirm password</label>
                <input
                  type="password"
                  required
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
              {err && <p className="text-xs text-red-500">{err}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
