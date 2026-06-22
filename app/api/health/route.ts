import { NextResponse } from "next/server";

export const runtime = "edge";

export function GET() {
  return NextResponse.json({
    status: "ok",
    token: "masteri-test-endtoken-2026",
    timestamp: new Date().toISOString(),
  });
}
