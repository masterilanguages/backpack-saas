// Platform listen-aloud. Any school calls the same endpoint; `language` selects
// the locale (Hebrew → he-IL). Audio is mpeg. 503 + { fallback: true } means
// the browser should use speechSynthesis — no provider key is configured.
//
//   POST /api/speech/tts
//   { "text": "שלום", "language": "hebrew", "locale": "he-IL" }

import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/speech/synthesize";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { text?: unknown; language?: unknown; locale?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });
  if (text.length > 800) return NextResponse.json({ error: "Text is too long" }, { status: 400 });

  try {
    const clip = await synthesizeSpeech(text, String(body.language || ""), body.locale ? String(body.locale) : null);
    if (!clip) {
      return NextResponse.json({
        error: "No speech provider is configured",
        fallback: true,
        hint: "Set AZURE_SPEECH_KEY for neural voices. Hebrew uses he-IL-HilaNeural. See docs/speech.md.",
      }, { status: 503 });
    }
    return new NextResponse(Buffer.from(clip.audio), {
      status: 200,
      headers: {
        "Content-Type": clip.contentType,
        "Cache-Control": "private, max-age=31536000",
        "X-Speech-Provider": clip.provider,
        "X-Speech-Voice": clip.voice,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Speech failed", fallback: true }, { status: 502 });
  }
}
