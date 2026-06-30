import { NextResponse } from "next/server";
import { slugFromHost } from "@/lib/tenant-host";
import { getSchoolBySlug } from "@/lib/queries";
import { selfRegisterStudent } from "@/lib/onboarding";

/**
 * Auto-registro PÚBLICO de alumno. Lo llama el "Create account" del login de una
 * escuela. La escuela se deriva del Host (subdominio) — NO de un dato del cliente
 * — así el alumno solo puede registrarse en la escuela cuyo sitio está visitando.
 * Solo disponible en un subdominio de escuela válido (no en apex/www).
 */
export async function POST(req: Request) {
  const slug = slugFromHost(req.headers.get("host"));
  if (!slug) {
    return NextResponse.json(
      { error: "Sign up is only available on a school's site." },
      { status: 400 },
    );
  }

  let org: { id: string } | null = null;
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

  // La cuenta queda email_confirm=true -> el cliente inicia sesión con la misma
  // contraseña y el middleware lo enruta a /learn por su membership(student).
  return NextResponse.json({ ok: true, email: result.email }, { status: 201 });
}
