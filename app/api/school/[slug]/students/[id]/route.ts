import { NextResponse } from "next/server";
import { getSchoolBySlug, getStudentDetail } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string; id: string } },
) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const school = await getSchoolBySlug(params.slug);
  const detail = await getStudentDetail(school.id, params.id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}
