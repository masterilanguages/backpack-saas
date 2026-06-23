import { NextResponse } from "next/server";
import { getSchoolBySlug, getLeads, createLead } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const leads = await getLeads(school.id);
  return NextResponse.json(leads);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const lead = await createLead(school.id, body);
  return NextResponse.json(lead, { status: 201 });
}
