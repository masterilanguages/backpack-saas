import { NextResponse } from "next/server";
import { getSchoolBySlug, getCalendarEvents } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const events = await getCalendarEvents(school.id);
  return NextResponse.json(events);
}
