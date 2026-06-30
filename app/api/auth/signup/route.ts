import { NextResponse } from "next/server";
import { Resend } from "resend";
import { slugFromHost } from "@/lib/tenant-host";
import { getSchoolBySlug } from "@/lib/queries";
import { selfRegisterStudent } from "@/lib/onboarding";

/**
 * Auto-registro PÚBLICO de alumno. Lo llama el "Create account" del login de una
 * escuela. La escuela se deriva del Host (subdominio) — NO de un dato del cliente
 * — así el alumno solo puede registrarse en la escuela cuyo sitio está visitando.
 * Solo disponible en un subdominio de escuela válido (no en apex/www).
 *
 * Tras crear una cuenta NUEVA envía un correo de bienvenida POR-ESCUELA vía Resend
 * (best-effort: si Resend no está o falla, el alta NO se rompe — el alumno ya entró).
 */
async function sendWelcomeEmail(opts: {
  to: string;
  name?: string;
  schoolName: string;
  loginUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[signup] RESEND_API_KEY no configurada; no se envió bienvenida.");
    return;
  }
  const { to, name, schoolName, loginUrl } = opts;
  const greeting = name ? `Hi ${name},` : "Hi,";
  const cta = loginUrl
    ? `<p style="margin:24px 0">
         <a href="${loginUrl}" style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Go to ${schoolName}</a>
       </p>`
    : "";
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Backpack <onboarding@resend.dev>",
      to,
      subject: `Welcome to ${schoolName}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#0f172a">Welcome to ${schoolName} 🎒</h2>
          <p style="color:#334155">${greeting}</p>
          <p style="color:#334155">Your account is ready — you can start learning right away. Sign in any time with this email address.</p>
          ${cta}
          <p style="color:#94a3b8;font-size:12px">Powered by Backpack</p>
        </div>`,
    });
  } catch (e: any) {
    console.error("[signup] Resend error:", e?.message);
  }
}

export async function POST(req: Request) {
  const host = req.headers.get("host");
  const slug = slugFromHost(host);
  if (!slug) {
    return NextResponse.json(
      { error: "Sign up is only available on a school's site." },
      { status: 400 },
    );
  }

  let org: { id: string; name?: string | null } | null = null;
  try {
    org = await getSchoolBySlug(slug);
  } catch {
    org = null;
  }
  if (!org) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = body.name ? String(body.name).trim() : undefined;
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const result = await selfRegisterStudent(org.id, email, name, password);

  if (result.error === "EMAIL_EXISTS") {
    return NextResponse.json(
      { error: "That email already has an account. Please sign in instead." },
      { status: 409 },
    );
  }
  if (!result.userId) {
    return NextResponse.json(
      { error: result.error === "PASSWORD_SHORT" ? "Password must be at least 8 characters." : (result.error ?? "Could not create the account.") },
      { status: 400 },
    );
  }

  // Solo en altas NUEVAS: correo de bienvenida con el nombre de la escuela.
  // Se DEBE await (Vercel congela la lambda al responder) — best-effort.
  if (result.created) {
    const schoolName = (org.name && org.name.trim()) || "your school";
    const loginUrl = host ? `https://${host}` : "";
    await sendWelcomeEmail({ to: result.email, name, schoolName, loginUrl });
  }

  // La cuenta queda email_confirm=true -> el cliente inicia sesión con la misma
  // contraseña y el middleware lo enruta al home del alumno por su membership.
  return NextResponse.json({ ok: true, email: result.email }, { status: 201 });
}
