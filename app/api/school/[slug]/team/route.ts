import { NextResponse } from "next/server";
import { getSchoolBySlug, getTeamMembers } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const team = await getTeamMembers(school.id);
  return NextResponse.json(team);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from("team_members").insert({ school_id: school.id, ...body }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
