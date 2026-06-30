import { NextResponse } from "next/server";
import { getSchoolBySlug, getTeamMembers, updateTeamMember, deleteTeamMember } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase";
import { requireOrgRole } from "@/lib/supabase-ssr";
import { createCoachAccount } from "@/lib/onboarding";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  // Lectura del team permitida a coach tambien: la necesita el desplegable de
  // Coach en "New Lesson" (y el autocompletado). GESTIONAR el team (POST) sigue
  // siendo solo owner/admin.
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const team = await getTeamMembers(school.id);
  return NextResponse.json(team);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const { data, error } = await supabaseAdmin
    .from("team_members")
    .insert({ org_id: school.id, ...body })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Si trae email, crea tambien la CUENTA REAL (usuario auth + membership coach)
  // ademas del registro de roster. Sin email = solo roster (sin acceso).
  let account = null;
  if (body.email) {
    account = await createCoachAccount(school.id, body.email, body.name);
  }
  return NextResponse.json({ ...data, _account: account }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...input } = await req.json();
  await updateTeamMember(id, input);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  const { id } = await req.json();
  await deleteTeamMember(school.id, id);
  return NextResponse.json({ ok: true });
}
