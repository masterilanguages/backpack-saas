import { NextResponse } from "next/server";
import { getSchoolBySlug, getNotes, updateNote, deleteNote } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const notes = await getNotes(school.id);
  return NextResponse.json(notes);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from("notes").insert({ school_id: school.id, ...body }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const { id, ...input } = await req.json();
  const note = await updateNote(id, input);
  return NextResponse.json(note);
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const { id } = await req.json();
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
