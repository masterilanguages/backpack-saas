import { NextResponse } from "next/server";
import {
  getSchoolBySlug,
  getCoachIdByEmail,
  getStudentCoachId,
  addCoachNote,
  deleteCoachNote,
} from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

/**
 * Notas de coaching de UN alumno. owner/admin pueden en cualquier alumno; un
 * coach SOLO en sus alumnos asignados (valida meta.coach_id). Devuelve el ctx
 * autorizado o un código de error.
 */
async function authorize(slug: string, studentId: string) {
  const ctx = await requireOrgRole(slug, ["owner", "admin", "coach"]);
  if (!ctx) return { status: 403 as const };
  const school = await getSchoolBySlug(slug);
  if (ctx.role === "coach") {
    const coachId = await getCoachIdByEmail(school.id, ctx.email);
    const assigned = await getStudentCoachId(studentId);
    if (!coachId || assigned !== coachId) return { status: 404 as const };
  }
  return { ctx };
}

export async function POST(req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorize(params.slug, params.id);
  if ("status" in auth) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { text } = await req.json();
  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Texto vacío" }, { status: 400 });
  }
  const note = await addCoachNote(params.id, {
    text: String(text).trim(),
    author: auth.ctx.name || auth.ctx.email,
  });
  return NextResponse.json(note, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorize(params.slug, params.id);
  if ("status" in auth) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { noteId } = await req.json();
  await deleteCoachNote(params.id, noteId);
  return NextResponse.json({ ok: true });
}
