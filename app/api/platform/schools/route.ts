import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform";
import { provisionSchool } from "@/lib/provisioning";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * /api/platform/schools — superficie PLATFORM-ADMIN-ONLY.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  -> lista TODAS las organizations (para el panel de plataforma).
 * POST -> da de alta una escuela nueva (org + owner + subdominio) via el motor
 *         reutilizable provisionSchool().
 *
 * SEGURIDAD: AMBOS metodos exigen requirePlatformAdmin() server-side. Un miembro
 * normal de una org (owner/admin/coach/student de un tenant) NO es platform admin
 * y recibe 403. La autoridad se deriva de platform_admins (no de un header/JWT).
 */

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // service_role: bypassa RLS para ver TODAS las orgs (vista de plataforma).
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { name?: string; slug?: string; ownerEmail?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const result = await provisionSchool({
    name: body.name ?? "",
    slug: body.slug ?? "",
    ownerEmail: body.ownerEmail ?? "",
    plan: body.plan,
  });

  // CUALQUIER error de provisionamiento -> NO es 201. Distinguimos:
  //   - org NO creada (validacion de slug/entrada, o fallo del insert)  -> 400.
  //   - org creada pero el owner/membership fallo (fallo PARCIAL: la escuela
  //     existe sin acceso del owner)                                    -> 500.
  // (El fallo de subdominio en Vercel NO cuenta como error: es best-effort y
  //  viaja como subdomainRegistered:false dentro de un 201 exitoso.)
  if (result.error) {
    return NextResponse.json(result, { status: result.orgId ? 500 : 400 });
  }

  return NextResponse.json(result, { status: 201 });
}
