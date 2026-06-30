import { NextResponse } from "next/server";
import { getSchoolBySlug, getSchoolWords, getCoachIdByEmail } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  let coachId: string | null = null;
  if (ctx.role === "coach") {
    coachId = await getCoachIdByEmail(school.id, ctx.email);
    if (!coachId) return NextResponse.json([]);
  }
  const words = await getSchoolWords(school.id, coachId);
  return NextResponse.json(words);
}
