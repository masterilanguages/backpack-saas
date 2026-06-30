import { NextResponse } from "next/server";
import { getSchoolBySlug, getStudentDetail, getCoachIdByEmail } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string; id: string } },
) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const school = await getSchoolBySlug(params.slug);
  const detail = await getStudentDetail(school.id, params.id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reglas de coach (Plan-Fundacion 0.3): solo SUS alumnos asignados, y NO lee
  // el journal intimo del alumno (solo progreso/vocabulario).
  if (ctx.role === "coach") {
    const coachId = await getCoachIdByEmail(school.id, ctx.email);
    const assigned = (detail.student as any)?.meta?.coach_id ?? null;
    if (!coachId || assigned !== coachId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    detail.journal = [];
  }

  return NextResponse.json(detail);
}
