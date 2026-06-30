import { NextResponse } from "next/server";
import { getSchoolBySlug, getLessons, createLesson, deleteLesson } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const lessons = await getLessons(school.id);
  return NextResponse.json(lessons);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const lesson = await createLesson(school.id, {
    student_id: body.student_id || undefined,
    coach: body.coach,
    language: body.language,
    date: body.date,
    time: body.time,
    topic: body.topic,
    status: body.status,
    notes: body.notes,
  });
  return NextResponse.json(lesson, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  await deleteLesson(id);
  return NextResponse.json({ ok: true });
}
