import { NextResponse } from "next/server";
import { getSchoolBySlug, getTasks, createTask, updateTask } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const tasks = await getTasks(school.id);
  return NextResponse.json(tasks);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const task = await createTask(school.id, body);
  return NextResponse.json(task, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const { id, ...input } = await req.json();
  await updateTask(id, input);
  return NextResponse.json({ ok: true });
}
