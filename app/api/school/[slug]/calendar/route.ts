import { NextResponse } from "next/server";
import { getSchoolBySlug, getCalendarEvents, createCalendarEvent, deleteCalendarEvent } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const events = await getCalendarEvents(school.id);
  return NextResponse.json(events);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const event = await createCalendarEvent(school.id, {
    title: body.title,
    date: body.date,
    time: body.time,
    type: body.type,
  });
  return NextResponse.json(event, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  await deleteCalendarEvent(id);
  return NextResponse.json({ ok: true });
}
