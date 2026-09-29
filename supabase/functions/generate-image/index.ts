// generate-image — generates an image and stores it in Supabase Storage,
// returning { url } (a public URL) to match the original return shape.
//
// Provider priority (set the matching secret to choose):
//   1. CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN → FLUX.1-schnell via
//      Cloudflare Workers AI — FREE (10k neurons/day, no card), ~2s. (Primary.)
//      NOTE: Cloudflare's flux-1-schnell schema no longer accepts `seed`
//      ("Additional or unevaluated properties '/seed' not allowed"), which made
//      every image fall through to the next provider — so it isn't sent.
//   2. FLUXAPI_KEY     → FLUX.1 Kontext (pro/max) via fluxapi.ai — premium
//      photorealistic quality but slow (~10-23s), ASYNC (generate → poll).
//      No seed. Model via FLUXAPI_MODEL (default "flux-kontext-pro").
//   3. FAL_KEY         → FLUX schnell via fal.ai — cheap (~$0.003/img),
//      fast (~2s), supports a SEED. (Requires a funded balance.)
//   4. GEMINI_API_KEY  → Gemini "Nano Banana" (gemini-2.5-flash-image),
//      fast (~5s) but requires billing enabled; no seed.
//   5. OPENAI_API_KEY  → OpenAI gpt-image-1 (fallback), slow (20-60s).
// Switch providers by setting/removing a secret — no code change needed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const GEMINI_MODEL = "gemini-2.5-flash-image";
const FAL_FLUX_URL = "https://fal.run/fal-ai/flux/schnell";
const FLUXAPI_BASE = "https://api.fluxapi.ai/api/v1/flux/kontext";
// A fixed default seed keeps the overall art STYLE coherent across words
// (different prompts → different subjects, but a shared visual feel).
const DEFAULT_SEED = 42;

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function generateWithFluxApi(prompt: string, key: string, model: string) {
  // 1. Kick off the generation — returns a taskId (async API).
  const genResp = await fetch(`${FLUXAPI_BASE}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model,
      aspectRatio: "1:1",
      outputFormat: "jpeg",
    }),
  });
  if (!genResp.ok) {
    throw new Error(`FluxAPI generate failed (${genResp.status}): ${await genResp.text()}`);
  }
  const genData = await genResp.json();
  const taskId = genData?.data?.taskId;
  if (!taskId) {
    throw new Error(`FluxAPI returned no taskId: ${JSON.stringify(genData)}`);
  }

  // 2. Poll record-info until the result image URL appears (~10s typical).
  let imgUrl: string | null = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResp = await fetch(
      `${FLUXAPI_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!pollResp.ok) continue;
    const d = (await pollResp.json())?.data;
    const url = d?.response?.resultImageUrl;
    if (url) {
      imgUrl = url;
      break;
    }
    if (d?.errorCode || d?.errorMessage) {
      throw new Error(`FluxAPI generation error: ${d.errorMessage || d.errorCode}`);
    }
  }
  if (!imgUrl) throw new Error("FluxAPI timed out waiting for the image");

  // 3. Download the bytes (the URL is temporary) to re-host in Storage.
  const imgResp = await fetch(imgUrl);
  if (!imgResp.ok) throw new Error(`FluxAPI image download failed (${imgResp.status})`);
  return { bytes: new Uint8Array(await imgResp.arrayBuffer()), mime: "image/jpeg" };
}

async function generateWithCloudflare(
  prompt: string,
  accountId: string,
  token: string,
) {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, steps: 4 }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Cloudflare image failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  // Cloudflare wraps model output: { result: { image: "<base64 jpeg>" }, success }
  const b64 = data?.result?.image || data?.image;
  if (!b64) {
    throw new Error(
      `Cloudflare returned no image: ${JSON.stringify(data?.errors || data)}`,
    );
  }
  return { bytes: b64ToBytes(b64), mime: "image/jpeg" };
}

async function generateWithFlux(prompt: string, key: string, seed: number) {
  // fal.ai synchronous endpoint — returns the result directly (no polling).
  const resp = await fetch(FAL_FLUX_URL, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      seed,
      image_size: "square_hd", // 1024x1024
      num_inference_steps: 4,
      num_images: 1,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Flux image failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const imgUrl = data?.images?.[0]?.url;
  const mime = data?.images?.[0]?.content_type || "image/jpeg";
  if (!imgUrl) {
    throw new Error("Flux returned no image");
  }
  // fal delivery URLs are temporary — download the bytes to re-host in Storage.
  const imgResp = await fetch(imgUrl);
  if (!imgResp.ok) throw new Error(`Flux image download failed (${imgResp.status})`);
  return { bytes: new Uint8Array(await imgResp.arrayBuffer()), mime };
}

async function generateWithGemini(prompt: string, apiKey: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini image failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data;
    if (inline?.data) {
      return {
        bytes: b64ToBytes(inline.data),
        mime: (inline.mimeType || inline.mime_type || "image/png") as string,
      };
    }
  }
  // No image part — surface any text the model returned (e.g. a safety refusal).
  const txt = parts.map((p: any) => p?.text).filter(Boolean).join(" ");
  throw new Error(`Gemini returned no image${txt ? ": " + txt : ""}`);
}

async function generateWithOpenAI(prompt: string, size: string, apiKey: string) {
  const oaResp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
  });
  if (!oaResp.ok) {
    const errText = await oaResp.text();
    throw new Error(`Image generation failed: ${errText}`);
  }
  const oaData = await oaResp.json();
  const b64 = oaData?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return { bytes: b64ToBytes(b64), mime: "image/png" };
}

function extFor(mime: string) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = body?.prompt || body?.text;
    if (!prompt) return json({ error: "Missing 'prompt'" }, 400);
    const size = body?.size || "1024x1024";
    const seed = Number.isInteger(body?.seed) ? body.seed : DEFAULT_SEED;

    const fluxApiKey = Deno.env.get("FLUXAPI_KEY");
    const fluxApiModel = Deno.env.get("FLUXAPI_MODEL") || "flux-kontext-pro";
    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const falKey = Deno.env.get("FAL_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    // Build the provider chain in priority order from whichever secrets exist.
    // Each is tried in turn; if one throws (e.g. daily quota hit), the next runs.
    // A provider is "off" simply by not having its secret set.
    const providers: {
      name: string;
      run: () => Promise<{ bytes: Uint8Array; mime: string }>;
    }[] = [];
    if (cfAccountId && cfToken) {
      providers.push({ name: "cloudflare", run: () => generateWithCloudflare(prompt, cfAccountId, cfToken) });
    }
    if (fluxApiKey) {
      providers.push({ name: "fluxapi", run: () => generateWithFluxApi(prompt, fluxApiKey, fluxApiModel) });
    }
    if (falKey) {
      providers.push({ name: "fal", run: () => generateWithFlux(prompt, falKey, seed) });
    }
    if (geminiKey) {
      providers.push({ name: "gemini", run: () => generateWithGemini(prompt, geminiKey) });
    }
    if (openaiKey) {
      providers.push({ name: "openai", run: () => generateWithOpenAI(prompt, size, openaiKey) });
    }

    if (providers.length === 0) {
      return json(
        { error: "No image provider configured (set CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN, FLUXAPI_KEY, FAL_KEY, GEMINI_API_KEY or OPENAI_API_KEY)" },
        500,
      );
    }

    let img: { bytes: Uint8Array; mime: string } | null = null;
    let source = "";
    let lastErr: unknown = null;
    for (const p of providers) {
      try {
        img = await p.run();
        source = p.name;
        break;
      } catch (e) {
        lastErr = e;
        console.error(`Image provider "${p.name}" failed:`, (e as Error)?.message || e);
      }
    }
    if (!img) {
      return json({ error: `All image providers failed: ${(lastErr as Error)?.message || lastErr}` }, 502);
    }

    // Upload to Storage (service role) and return a public URL.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const path = `generated/${crypto.randomUUID()}.${extFor(img.mime)}`;
    const { error: upErr } = await supabase.storage
      .from("uploads")
      .upload(path, img.bytes, { contentType: img.mime, upsert: false });
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

    const { data: pub } = supabase.storage.from("uploads").getPublicUrl(path);
    return json({ url: pub.publicUrl, source });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
