import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabase, supabaseAdmin } from "@/lib/supabase";

/**
 * "Olvidé mi contraseña" — self-service.
 * Siempre responde { ok: true } para no revelar si el email existe o no
 * (anti-enumeración).
 *
 * Dos caminos de envío:
 *  1. Si RESEND_API_KEY está configurada, generamos el link con Supabase admin
 *     y lo enviamos por Resend (correo con marca Backpack).
 *  2. Si NO hay Resend, hacemos fallback al correo de recuperación INTEGRADO de
 *     Supabase (su propio SMTP) para que el reset funcione igual sin config
 *     extra. Requiere que la plantilla "Reset Password" apunte a /auth/reset.
 *
 * Env opcional: EMAIL_FROM (p.ej. "Backpack <noreply@backpacksystems.com>").
 * Ojo: el default "onboarding@resend.dev" solo entrega a tu propia cuenta de
 * Resend — para usuarios reales verifica tu dominio y define EMAIL_FROM.
 */
export async function POST(req: Request) {
  let email = "";
  let origin = "";
  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    origin = String(body.origin ?? "").trim();
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (!email || !origin) return NextResponse.json({ ok: true });

  const redirectTo = `${origin}/auth/reset`;
  const apiKey = process.env.RESEND_API_KEY;

  // ── Fallback: sin Resend, usa el correo integrado de Supabase ──────────────
  if (!apiKey) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      // No filtramos al cliente, pero sí lo dejamos en logs para diagnóstico.
      console.error("[forgot] Supabase reset email error:", error.message);
      return NextResponse.json({ ok: true, emailSent: false });
    }
    return NextResponse.json({ ok: true, emailSent: true });
  }

  // ── Camino Resend: genera el link (NO envía) y lo mandamos nosotros ─────────
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  const link = data?.properties?.action_link;
  // Si el email no existe o falla, devolvemos ok igual (no filtrar).
  if (error || !link) return NextResponse.json({ ok: true, emailSent: false });

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Backpack <onboarding@resend.dev>",
      to: email,
      subject: "Reset your password",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#0f172a">Reset your password</h2>
          <p style="color:#334155">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
          <p style="margin:24px 0">
            <a href="${link}" style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a>
          </p>
          <p style="color:#94a3b8;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
        </div>`,
    });
  } catch (e: any) {
    console.error("[forgot] Resend error:", e?.message);
    // No filtramos el fallo al cliente.
    return NextResponse.json({ ok: true, emailSent: false });
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
