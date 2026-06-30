import { NextResponse } from "next/server";
import { getSchoolBySlug } from "@/lib/queries";
import { requireOrgRole } from "@/lib/supabase-ssr";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const ctx = await requireOrgRole(params.slug, ["owner", "admin", "coach"]);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const school = await getSchoolBySlug(params.slug);
  // adjuntamos rol + identidad del usuario en ESTA org (para acotar la vista y
  // mostrar QUIÉN está logueado en el Topbar).
  return NextResponse.json({
    ...school,
    role: ctx.role,
    userEmail: ctx.email,
    userName: ctx.name,
  });
}
