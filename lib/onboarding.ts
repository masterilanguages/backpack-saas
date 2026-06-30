import { randomBytes } from "crypto";
import { supabaseAdmin } from "./supabase";

/**
 * NUCLEO de alta de un alumno como CUENTA REAL: usuario en Supabase Auth +
 * membership(student) en la organizacion. Lo usa hoy el "Add student" del admin
 * (alta manual) y lo REUSARA el webhook de Stripe en la Fase 5 (alta por pago):
 * ambos caminos terminan creando lo mismo, solo cambia el gatillo.
 *
 * Devuelve la contrasena temporal SOLO cuando se crea un usuario nuevo (el admin
 * la comparte; el alumno deberia cambiarla). Idempotente: si el usuario ya existe
 * solo se asegura la membership.
 */
export interface CreateStudentAccountResult {
  userId: string | null;
  email: string;
  created: boolean;
  alreadyExisted: boolean;
  tempPassword: string | null;
  membership: boolean;
  error?: string;
}

function genTempPassword(): string {
  const s = randomBytes(8).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `Masteri-${s || "Aa1b2c"}9!`;
}

/** Busca el id de un usuario auth por email (proyecto chico: lista y filtra). */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const lc = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === lc);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function createStudentAccount(
  orgId: string,
  email: string,
  name?: string,
): Promise<CreateStudentAccountResult> {
  const clean = email.trim().toLowerCase();
  if (!clean) {
    return { userId: null, email: clean, created: false, alreadyExisted: false, tempPassword: null, membership: false, error: "Falta el email" };
  }

  let userId: string | null = null;
  let created = false;
  let alreadyExisted = false;
  let tempPassword: string | null = null;

  const tp = genTempPassword();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: clean,
    password: tp,
    email_confirm: true, // Masteri tiene mailer_autoconfirm; el alumno entra directo
    user_metadata: name ? { full_name: name } : {},
    app_metadata: { user_role: "user" }, // app_role() => 'user' = student
  });

  if (data?.user) {
    userId = data.user.id;
    created = true;
    tempPassword = tp;
  } else {
    // Lo mas comun: el email ya existe -> reutilizar ese usuario.
    userId = await findUserIdByEmail(clean);
    alreadyExisted = Boolean(userId);
    if (!userId) {
      return { userId: null, email: clean, created: false, alreadyExisted: false, tempPassword: null, membership: false, error: error?.message ?? "No se pudo crear el usuario" };
    }
  }

  // Membership(student) idempotente (unique(org_id, user_id)).
  const { error: memErr } = await supabaseAdmin
    .from("memberships")
    .upsert(
      { org_id: orgId, user_id: userId, role: "student" },
      { onConflict: "org_id,user_id", ignoreDuplicates: true },
    );

  return { userId, email: clean, created, alreadyExisted, tempPassword, membership: !memErr, error: memErr?.message };
}

/**
 * NUCLEO de alta de un COACH como CUENTA REAL: usuario en Supabase Auth +
 * membership(coach). Espejo de createStudentAccount, pero el rol del membership
 * es "coach" (no "student") -> el middleware lo rutea al Portal Admin (los roles
 * owner/admin/coach van al admin; student va al Learning Portal). app_metadata
 * marca "staff" (no es aprendiz); el acceso real lo da SIEMPRE el membership.
 * Idempotente: si el usuario ya existe solo asegura la membership.
 */
export async function createCoachAccount(
  orgId: string,
  email: string,
  name?: string,
): Promise<CreateStudentAccountResult> {
  const clean = email.trim().toLowerCase();
  if (!clean) {
    return { userId: null, email: clean, created: false, alreadyExisted: false, tempPassword: null, membership: false, error: "Falta el email" };
  }

  let userId: string | null = null;
  let created = false;
  let alreadyExisted = false;
  let tempPassword: string | null = null;

  const tp = genTempPassword();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: clean,
    password: tp,
    email_confirm: true,
    user_metadata: name ? { full_name: name } : {},
    app_metadata: { user_role: "staff" },
  });

  if (data?.user) {
    userId = data.user.id;
    created = true;
    tempPassword = tp;
  } else {
    userId = await findUserIdByEmail(clean);
    alreadyExisted = Boolean(userId);
    if (!userId) {
      return { userId: null, email: clean, created: false, alreadyExisted: false, tempPassword: null, membership: false, error: error?.message ?? "No se pudo crear el usuario" };
    }
  }

  // Membership(coach) idempotente (unique(org_id, user_id)).
  const { error: memErr } = await supabaseAdmin
    .from("memberships")
    .upsert(
      { org_id: orgId, user_id: userId, role: "coach" },
      { onConflict: "org_id,user_id", ignoreDuplicates: true },
    );

  return { userId, email: clean, created, alreadyExisted, tempPassword, membership: !memErr, error: memErr?.message };
}
