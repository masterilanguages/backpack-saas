import { NextResponse } from "next/server";
import { getSchoolBySlug, getLeads, createLead, updateLead, deleteLead } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const leads = await getLeads(school.id);
  return NextResponse.json(leads);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const lead = await createLead(school.id, body);
  return NextResponse.json(lead, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...input } = await req.json();
  await updateLead(id, input);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json();
  await deleteLead(id);
  return NextResponse.json({ ok: true });
}
