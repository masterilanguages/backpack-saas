import { NextResponse } from "next/server";
import { getSchoolBySlug } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  return NextResponse.json(school);
}
