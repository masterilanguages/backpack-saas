import { NextResponse } from "next/server";
import { getSchoolBySlug, getStudentsWithProgress, createStudent, updateStudent, deleteStudent } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const students = await getStudentsWithProgress(school.id);
  return NextResponse.json(students);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const student = await createStudent(school.id, body);
  return NextResponse.json(student, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...input } = await req.json();
  const student = await updateStudent(id, input);
  return NextResponse.json(student);
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  await deleteStudent(id);
  return NextResponse.json({ ok: true });
}
