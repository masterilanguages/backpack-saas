import { randomBytes } from "crypto";
import { supabaseAdmin } from "./supabase";
import { schoolExistsBySlug } from "./queries";

/**
 * MOTOR DE PROVISIONAMIENTO de una ESCUELA (organization) + su OWNER.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reutilizable y PURO (server-only, sin next/headers ni req/res): por eso lo
 * puede llamar tanto el panel platform-admin de alta MANUAL (Fase 5a) como el
 * webhook de Stripe de alta por PAGO (Fase 5b). Ambos caminos terminan creando
 * lo mismo (org + cuenta owner + membership), solo cambia el gatillo.
 *
 * MIRRORS lib/onboarding.ts::createStudentAccount para la parte de la cuenta:
 *   - supabaseAdmin.auth.admin.createUser({ email_confirm: true, ... })
 *   - si el email ya existe -> reutiliza ese usuario (idempotente).
 *   - memberships.upsert({ org_id, user_id, role }, onConflict org_id,user_id).
 * La diferencia: aqui el rol es 'owner' y el marcador es app_metadata.user_role
 * = 'admin' (el unico rol elevado del censo; ver 0200_link_identity: user_role
 * 'admin' => membership 'owner').
 *
 * IDEMPOTENTE: re-ejecutar con un email ya existente solo reasegura la
 * membership; con un slug ya tomado devuelve un error claro (no duplica).
 *
 * El alta del subdominio en Vercel es BEST-EFFORT: si faltan credenciales o la
 * API falla, NUNCA tira la operacion — la escuela queda creada igual y se
 * reporta subdomainRegistered:false con un motivo legible.
 */

// ── Config ──────────────────────────────────────────────────────────────────

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "backpacksystems.com";

/** Subdominios que NO son tenants (mirror de middleware.ts RESERVED_SUBDOMAINS). */
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "platform"]);

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface ProvisionSchoolInput {
  name: string;
  slug: string;
  ownerEmail: string;
  /** starter | school | growth | enterprise (libre; se normaliza a minusculas). */
  plan?: string;
}

export interface ProvisionSchoolResult {
  orgId: string | null;
  slug: string;
  ownerEmail: string;
  /** Solo presente cuando se CREA un usuario owner nuevo (compartir y rotar). */
  tempPassword: string | null;
  /** El usuario owner fue creado en esta llamada. */
  created: boolean;
  /** El email del owner ya tenia cuenta -> se reutilizo. */
  alreadyExisted: boolean;
  /** La membership(owner) quedo asegurada. */
  membership: boolean;
  /** El subdominio {slug}.{ROOT_DOMAIN} quedo registrado en Vercel. */
  subdomainRegistered: boolean;
  /** Motivo legible si subdomainRegistered es false (best-effort, no es fatal). */
  subdomainError?: string;
  /** El subdominio publico de la escuela (siempre se devuelve para mostrarlo). */
  subdomain: string;
  /** Error fatal de provisionamiento (org/cuenta). Vacio = exito. */
  error?: string;
}

// ── Helpers de cuenta (MIRROR de lib/onboarding.ts) ──────────────────────────

/**
 * Contrasena temporal aleatoria. Prefijo neutro de plataforma ("Backpack-")
 * porque este motor crea owners de CUALQUIER escuela, no solo de Masteri.
 */
function genTempPassword(): string {
  const s = randomBytes(8).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `Backpack-${s || "Aa1b2c"}9!`;
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

// ── Validacion de slug ───────────────────────────────────────────────────────

function validateSlug(raw: string): { slug: string; error?: string } {
  const slug = raw.trim().toLowerCase();
  if (!slug) return { slug, error: "Falta el slug" };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { slug, error: "El slug solo admite minusculas, numeros y guiones" };
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return { slug, error: "El slug no puede empezar ni terminar con guion" };
  }
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { slug, error: `"${slug}" es un subdominio reservado` };
  }
  return { slug };
}

// ── Alta del subdominio en Vercel (BEST-EFFORT) ──────────────────────────────

/**
 * Registra {slug}.{ROOT_DOMAIN} como dominio del proyecto en Vercel via REST.
 * BEST-EFFORT: lee credenciales de process.env; si falta alguna, SALTA con un
 * motivo legible. NUNCA tira (try/catch global) ni hardcodea token alguno.
 * Un 409 (dominio ya agregado) se considera exito idempotente.
 */
async function registerSubdomainOnVercel(
  slug: string,
): Promise<{ registered: boolean; reason?: string }> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const domain = `${slug}.${ROOT_DOMAIN}`;

  if (!token || !projectId) {
    return {
      registered: false,
      reason:
        "Registro de subdominio omitido: faltan VERCEL_TOKEN / VERCEL_PROJECT_ID. " +
        `Agrega ${domain} manualmente en Vercel.`,
    };
  }

  try {
    const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${qs}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: domain }),
      },
    );

    if (res.ok) return { registered: true };

    // 409 = el dominio ya estaba agregado -> idempotente, lo damos por bueno.
    if (res.status === 409) return { registered: true };

    const text = await res.text().catch(() => "");
    return {
      registered: false,
      reason: `Vercel respondio ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      registered: false,
      reason: `No se pudo contactar a Vercel: ${(e as Error).message}`,
    };
  }
}

// ── Motor principal ──────────────────────────────────────────────────────────

export async function provisionSchool(
  input: ProvisionSchoolInput,
): Promise<ProvisionSchoolResult> {
  const name = (input.name ?? "").trim();
  const ownerEmail = (input.ownerEmail ?? "").trim().toLowerCase();
  const plan = (input.plan ?? "starter").trim().toLowerCase() || "starter";

  const { slug, error: slugError } = validateSlug(input.slug ?? "");

  const base: ProvisionSchoolResult = {
    orgId: null,
    slug,
    ownerEmail,
    tempPassword: null,
    created: false,
    alreadyExisted: false,
    membership: false,
    subdomainRegistered: false,
    subdomain: `${slug}.${ROOT_DOMAIN}`,
  };

  // (0) Validaciones de entrada.
  if (slugError) return { ...base, error: slugError };
  if (!name) return { ...base, error: "Falta el nombre de la escuela" };
  if (!ownerEmail) return { ...base, error: "Falta el email del owner" };

  // (1) El slug no puede estar tomado (unique en organizations; ademas chequeo
  //     previo para un mensaje claro en vez de un error crudo de la BD).
  if (await schoolExistsBySlug(slug)) {
    return { ...base, error: `Ya existe una escuela con el slug "${slug}"` };
  }

  // (2) Crear la organization. `active: true`. El `plan` se incluye SOLO si la
  //     columna existe: si la BD no la tiene todavia (entornos viejos), PostgREST
  //     responde 42703 / PGRST204 y reintentamos sin `plan` (tolerante).
  const orgBase = { slug, name, active: true };
  let org: { id: string } | null = null;

  {
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .insert({ ...orgBase, plan })
      .select("id")
      .single();

    if (error && isMissingColumnError(error, "plan")) {
      // La columna plan aun no existe (ver supabase/migrations/0600_org_plan.sql).
      const retry = await supabaseAdmin
        .from("organizations")
        .insert(orgBase)
        .select("id")
        .single();
      if (retry.error) return { ...base, error: retry.error.message };
      org = retry.data as { id: string };
    } else if (error) {
      return { ...base, error: error.message };
    } else {
      org = data as { id: string };
    }
  }

  const orgId = org!.id;

  // (3) Crear la CUENTA del owner (MIRROR de createStudentAccount, rol owner).
  let userId: string | null = null;
  let created = false;
  let alreadyExisted = false;
  let tempPassword: string | null = null;

  const tp = genTempPassword();
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    password: tp,
    email_confirm: true, // entra directo; deberia cambiar la contrasena al ingresar
    user_metadata: name ? { full_name: name } : {},
    app_metadata: { user_role: "admin" }, // 'admin' = marcador de rol elevado => owner
  });

  if (userData?.user) {
    userId = userData.user.id;
    created = true;
    tempPassword = tp;
  } else {
    // Lo mas comun: el email ya existe -> reutilizar ese usuario.
    userId = await findUserIdByEmail(ownerEmail);
    alreadyExisted = Boolean(userId);
    if (!userId) {
      return {
        ...base,
        orgId,
        error: userError?.message ?? "No se pudo crear el usuario owner",
      };
    }
  }

  // (4) Membership(owner) idempotente (unique(org_id, user_id)).
  const { error: memErr } = await supabaseAdmin
    .from("memberships")
    .upsert(
      { org_id: orgId, user_id: userId, role: "owner" },
      { onConflict: "org_id,user_id", ignoreDuplicates: true },
    );

  // (5) Alta del subdominio en Vercel (best-effort, nunca fatal).
  const sub = await registerSubdomainOnVercel(slug);

  return {
    orgId,
    slug,
    ownerEmail,
    tempPassword,
    created,
    alreadyExisted,
    membership: !memErr,
    subdomainRegistered: sub.registered,
    subdomainError: sub.registered ? undefined : sub.reason,
    subdomain: `${slug}.${ROOT_DOMAIN}`,
    error: memErr?.message,
  };
}

/**
 * True si el error de PostgREST/Postgres indica que la columna `col` no existe
 * (BD sin la migracion aditiva todavia). Cubre el code 42703 de Postgres y el
 * PGRST204 ("Could not find the '<col>' column ... in the schema cache").
 */
function isMissingColumnError(error: { code?: string; message?: string }, col: string): boolean {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "42703" || code === "PGRST204") return true;
  return msg.includes(col) && (msg.includes("does not exist") || msg.includes("schema cache"));
}
