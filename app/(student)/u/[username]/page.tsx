// ============================================================================
// app/(student)/u/[username]/page.tsx
// ----------------------------------------------------------------------------
// Ruta PRIVADA del Learning Portal:  {slug}.backpacksystems.com/u/{username}
//
// Server Component. Control de acceso TRIPLE (defensa en profundidad):
//
//   (1) MIDDLEWARE  -> ya verifico (a) que el subdominio resuelve a una org
//                      viva y (b) que hay una sesion con membership en esa org.
//                      Aqui CONFIAMOS pero re-verificamos (no es la unica capa).
//
//   (2) ESTA PAGINA -> con un cliente Supabase PER-USUARIO (anon key + la cookie
//                      de sesion del propio usuario). NUNCA service_role: si
//                      usaramos service_role saltariamos RLS y tendriamos que
//                      reimplementar la seguridad a mano (anti-patron). El
//                      usuario solo ve lo que su JWT + RLS le permiten.
//                      Resolvemos el alumno por (org_id, lower(username)) y
//                      decidimos `allowed`:
//                          allowed = es el PROPIO alumno
//                                 OR es su COACH asignado (coach_assignment)
//                                 OR es ADMIN/OWNER de la org (o platform admin)
//                      Si NO -> notFound() (404, NUNCA 403: no revelamos la
//                      existencia del recurso a quien no debe verlo).
//
//   (3) RLS         -> ultima linea. Aunque la logica de (2) tuviera un bug, las
//                      policies de 0400_rls_reconcile.sql (eje org_id + dueno/rol)
//                      impiden leer/escribir filas de otro tenant o de otro
//                      alumno. La pagina nunca usa una via que saltee RLS.
//
// username es UNICO POR ORG (unique index students(org_id, username) en
// 0200_link_identity.sql). Por eso TODO lookup de alumno es por el par
// (org_id, lower(username)), jamas por username global.
//
// Contrato de esquema (fuente de verdad = supabase/migrations):
//   organizations(id, slug, name, active, ...)            -- 0100
//   memberships(org_id, user_id, role)                    -- 0100, role: owner|admin|coach|student
//   students(org_id, username, email, name, status, meta) -- 0200, unique(org_id, username)
//   coach_assignment(org_id, coach_email, student_email)  -- 0300 (+org_id) / 0400
//   helpers RLS: app_email(), has_org_role(uuid,text), is_platform_admin()
//
// DEPENDENCIA: requiere `@supabase/ssr` (ya usado en el resto del workspace).
//   Anadir a backpack-saas/package.json:  "@supabase/ssr": "^0.5.2"
// ============================================================================

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// El portal lee la sesion del usuario en vivo: no cachear, no prerenderizar.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ----------------------------------------------------------------------------
// Cliente Supabase PER-USUARIO (Server Component).
// anon key + cookies de la sesion del usuario  ->  todas las consultas corren
// BAJO RLS con el JWT del usuario. NUNCA service_role.
//
// En un Server Component las cookies son de SOLO LECTURA: setAll puede lanzar.
// Lo envolvemos en try/catch — el refresh real de la cookie de sesion lo hace
// el middleware (patron oficial @supabase/ssr para App Router).
// ----------------------------------------------------------------------------
function createUserScopedClient() {
  const cookieStore = cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Falla cerrada: sin config no se puede verificar acceso -> 404.
    notFound();
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: ignorar. El middleware refresca
          // la cookie de sesion en la respuesta.
        }
      },
    },
  });
}

// ----------------------------------------------------------------------------
// Resolver el slug de la organizacion del tenant actual.
// Preferimos el header `x-org-slug` que inyecta el middleware (autoridad: ya
// valido org + membership). Como respaldo, lo derivamos del subdominio del Host
// ({slug}.backpacksystems.com). Sin slug resoluble -> 404.
// ----------------------------------------------------------------------------
function resolveOrgSlug(): string {
  const h = headers();

  const fromMiddleware = h.get("x-org-slug");
  if (fromMiddleware && fromMiddleware.trim()) {
    return fromMiddleware.trim().toLowerCase();
  }

  // Respaldo: primer label del host (sin puerto). Ej: "masteri.backpacksystems.com" -> "masteri".
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase();
  const labels = host.split(".");

  // Hosts sin subdominio de tenant (localhost, dominio apex) no resuelven org.
  const RESERVED = new Set(["www", "app", "admin", "api", "localhost", ""]);
  if (labels.length >= 3 && !RESERVED.has(labels[0])) {
    return labels[0];
  }

  // Sin tenant identificable: no exponemos nada.
  notFound();
  // notFound() es `never`; este throw solo satisface el control de flujo del
  // compilador en contextos donde el tipo `never` no se infiere.
  throw new Error("unreachable");
}

// `username` puede venir URL-encoded; lo normalizamos a lower-case para casar
// con el unique index por org. (El INSERT de 0200 ya genera usernames en
// minusculas; comparar en lower-case es robusto y evita duplicados por caja.)
function normalizeUsername(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* dejar el valor crudo si no es URI valido */
  }
  return decoded.trim().toLowerCase();
}

interface PageProps {
  params: { username: string };
}

export default async function StudentPrivatePage({ params }: PageProps) {
  const username = normalizeUsername(params.username);
  if (!username) notFound();

  const orgSlug = resolveOrgSlug();
  const supabase = createUserScopedClient();

  // --------------------------------------------------------------------------
  // 0) Sesion. Sin usuario autenticado NO hay nada que mostrar -> 404.
  //    (El middleware ya deberia haber redirigido a /login; esto es backstop.)
  // --------------------------------------------------------------------------
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const viewerEmail = (user.email ?? "").toLowerCase();

  // --------------------------------------------------------------------------
  // 1) Resolver la ORG por slug (bajo RLS: organizations_member_select solo deja
  //    ver la(s) org(s) del usuario). Si el viewer no pertenece a esta org, la
  //    fila no es visible -> data null -> 404. Esto re-valida la capa (1).
  // --------------------------------------------------------------------------
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, slug, name, active")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgErr || !org || org.active === false) notFound();
  const orgId = org.id as string;

  // --------------------------------------------------------------------------
  // 2) Resolver el ALUMNO por (org_id, lower(username)).
  //    username es UNICO POR ORG -> el par identifica una sola fila.
  //
  //    OJO RLS: students.students_org_select solo concede SELECT a miembros de
  //    la org via my_org_ids() / platform admin (ver 0400). Un coach o el propio
  //    alumno PUEDEN no recibir esta fila por RLS aunque deban ver la pagina.
  //    Por eso NO derivamos la autorizacion de "pude leer students": calculamos
  //    `allowed` explicitamente abajo con datos que el viewer SI puede leer
  //    (su membership/rol via has_org_role, y su vinculo via coach_assignment),
  //    y solo entonces renderizamos. La fila `student` se usa para identidad
  //    (email del alumno) cuando el viewer tiene acceso a leerla.
  // --------------------------------------------------------------------------
  const { data: student } = await supabase
    .from("students")
    .select("id, org_id, username, email, name, status")
    .eq("org_id", orgId)
    .eq("username", username)
    .maybeSingle();

  // El email del alumno destino. Si el viewer no pudo leer `students` por RLS
  // (p.ej. un coach), lo resolveremos por el vinculo coach_assignment mas abajo.
  const studentEmail = (student?.email ?? "").toLowerCase();

  // --------------------------------------------------------------------------
  // 3) DECISION DE ACCESO  (allowed = self OR coach-asignado OR admin/owner)
  // --------------------------------------------------------------------------

  // 3a) admin / owner de ESTA org (o platform admin). Una sola fuente de verdad:
  //     el helper canonico has_org_role(org, 'admin') (incluye is_platform_admin).
  let isOrgAdmin = false;
  {
    const { data, error } = await supabase.rpc("has_org_role", {
      p_org: orgId,
      p_min: "admin",
    });
    if (!error) isOrgAdmin = data === true;
  }

  // 3b) ¿es el PROPIO alumno? El viewer es el alumno si su email coincide con el
  //     del registro students. Si RLS le oculto students al propio alumno (no
  //     deberia, pero defendemos), tratamos el caso por coach_assignment abajo.
  const isSelf =
    isOrgAdmin === false &&
    !!viewerEmail &&
    !!studentEmail &&
    viewerEmail === studentEmail;

  // 3c) ¿es el COACH asignado a este alumno, en esta org?
  //     coach_assignment es visible al coach por RLS (coach_assignment_org_select:
  //     coach_email = app_email()). Consultamos por el par (coach=viewer, alumno).
  //     Si no conocemos studentEmail (RLS oculto students), igual sirve: el coach
  //     NECESITA un email de alumno; lo tomamos del propio coach_assignment.
  let isAssignedCoach = false;
  let coachResolvedStudentEmail = "";
  if (!isOrgAdmin && !isSelf) {
    let q = supabase
      .from("coach_assignment")
      .select("student_email, coach_email, org_id")
      .eq("coach_email", viewerEmail);

    // Acotar al tenant cuando la columna existe (NULL-tolerante por transicion).
    q = q.or(`org_id.eq.${orgId},org_id.is.null`);

    // Si conocemos el email del alumno, restringimos al vinculo exacto.
    if (studentEmail) q = q.eq("student_email", studentEmail);

    const { data: links } = await q;

    if (Array.isArray(links) && links.length > 0) {
      if (studentEmail) {
        isAssignedCoach = true;
        coachResolvedStudentEmail = studentEmail;
      } else {
        // Sin students legible: el coach esta asignado a >=1 alumno en la org,
        // pero debemos confirmar que ESTE username corresponde a uno de ellos.
        // Resolvemos el username del alumno destino entre sus asignados.
        const assignedEmails = links
          .map((l) => (l.student_email ?? "").toLowerCase())
          .filter(Boolean);

        if (assignedEmails.length > 0) {
          const { data: match } = await supabase
            .from("students")
            .select("email, username")
            .eq("org_id", orgId)
            .eq("username", username)
            .in("email", assignedEmails)
            .maybeSingle();

          if (match?.email) {
            isAssignedCoach = true;
            coachResolvedStudentEmail = (match.email as string).toLowerCase();
          }
        }
      }
    }
  }

  const allowed = isOrgAdmin || isSelf || isAssignedCoach;

  // 404, NUNCA 403: si no esta autorizado, el recurso "no existe" para el viewer.
  if (!allowed) notFound();

  // Si llegamos aqui pero ni siquiera existe el registro del alumno (y no es un
  // coach que lo resolvio por el vinculo), el username no corresponde a un
  // alumno real de esta org -> 404.
  if (!student && !coachResolvedStudentEmail) notFound();

  // --------------------------------------------------------------------------
  // 4) Render. Identidad mostrada de forma segura (no filtramos datos de otros
  //    alumnos: todo lo de abajo es del alumno destino y corre bajo RLS).
  // --------------------------------------------------------------------------
  const displayName = student?.name ?? username;
  const displayEmail = student?.email ?? (coachResolvedStudentEmail || "");
  const viewerRole = isOrgAdmin
    ? "admin"
    : isSelf
      ? "student"
      : isAssignedCoach
        ? "coach"
        : "member";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {org.name ?? orgSlug} · Learning Portal
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{displayName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs">
            @{username}
          </span>
          {displayEmail && <span className="text-slate-500">{displayEmail}</span>}
          {student?.status && (
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
              {student.status}
            </span>
          )}
        </div>
      </header>

      {/* Contexto del visor: util para coach/admin que entran a la pagina de un
          alumno. El alumno se ve a si mismo como "student". */}
      {viewerRole !== "student" && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Estas viendo esta pagina como <strong>{viewerRole}</strong>.
        </p>
      )}

      {/*
        A partir de aqui se montan los modulos de aprendizaje del alumno
        (progreso, vocabulario, journal, etc.). Cada uno consulta con el MISMO
        cliente per-usuario, de modo que RLS (eje org_id + dueno/rol/coach,
        ver 0400_rls_reconcile.sql) sigue filtrando cada fila. Se dejan como
        slot para el porte del Learning Portal.
      */}
      <section aria-label="Resumen del alumno" className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Resumen</h2>
          <p className="mt-1 text-sm text-slate-500">
            Espacio privado de {displayName}. El contenido de aprendizaje
            (progreso, vocabulario y journal) se carga bajo la sesion del usuario
            con RLS activo.
          </p>
        </div>
      </section>
    </main>
  );
}
