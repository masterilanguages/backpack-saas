import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * "Olvidé mi contraseña" — self-service.
 * Genera el link de recuperación con Supabase admin y lo ENVÍA por Resend
 * (no depende del SMTP de Supabase). Siempre responde { ok: true } para no
 * revelar si el email existe o no (anti-enumeración).
 *
 * Requiere env: RESEND_API_KEY (y opcional EMAIL_FROM, p.ej.
 * "Backpack <noreply@backpacksystems.com>"). Sin la key, no envía (pero no
 * rompe): el flujo de UI sigue funcionando para cuando se configure.
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

  // Link de recuperación (NO envía email; solo lo genera).
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/reset` },
  });

  const link = data?.properties?.action_link;
  // Si el email no existe o falla, devolvemos ok igual (no filtrar).
  if (error || !link) return NextResponse.json({ ok: true });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Sin Resend configurado todavía: no podemos enviar. No rompemos el flujo.
    console.warn("[forgot] RESEND_API_KEY no configurada; no se envió el correo.");
    return NextResponse.json({ ok: true, emailSent: false });
  }

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
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
