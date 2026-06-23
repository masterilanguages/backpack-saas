import { NextResponse } from "next/server";
import { getSchoolBySlug, getTransactions, createTransaction } from "@/lib/queries";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const transactions = await getTransactions(school.id);
  return NextResponse.json(transactions);
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const school = await getSchoolBySlug(params.slug);
  const body = await req.json();
  const tx = await createTransaction(school.id, body);
  return NextResponse.json(tx, { status: 201 });
}
