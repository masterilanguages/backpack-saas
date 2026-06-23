import { NextResponse } from "next/server";
import { getSchoolBySlug, getStudents, createStudent, deleteStudent } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const students = await getStudents(school.id);
  return NextResponse.json(students);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const student = await createStudent(school.id, body);
  return NextResponse.json(student, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const { id } = await req.json();
  await deleteStudent(id);
  return NextResponse.json({ ok: true });
}
