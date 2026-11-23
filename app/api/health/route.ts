import { NextResponse } from "next/server";
import { aiProbeResponse, publicHealthBody } from "@/lib/aiHealth";

// Node (not edge) so HEALTH_CHECK_TOKEN and ANTHROPIC_API_KEY are read from
// the server environment on each request. They are never sent to the browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("ai") !== "1") {
    return NextResponse.json(publicHealthBody());
  }
  const result = await aiProbeResponse({
    authorizationHeader: request.headers.get("authorization"),
    expectedToken: process.env.HEALTH_CHECK_TOKEN,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  return NextResponse.json(result.body, { status: result.status });
}
