// generate-image — draws a mnemonic picture and stores it in the public
// `uploads` bucket. Returns { url, source, cached }.
//
// Models and fallbacks live in lib/mnemonicImageGen.ts. Secrets:
//   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN  (primary, FLUX.1 schnell, no seed)
//   FLUXAPI_KEY, FAL_KEY, GEMINI_API_KEY, OPENAI_API_KEY
// Optional: CLOUDFLARE_IMAGE_MODEL, FLUXAPI_MODEL, GEMINI_IMAGE_MODEL, OPENAI_IMAGE_MODEL
// gpt-image-1 is shut down and is never called, even if OPENAI_IMAGE_MODEL names it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { generateAndStore, ImageGenError, type StorageLike } from "../../../lib/mnemonicImageGen.ts";

function storageOf(supabase: any): StorageLike {
  const bucket = () => supabase.storage.from("uploads");
  return {
    download: (path) => bucket().download(path),
    upload: (path, bytes, opts) => bucket().upload(path, bytes, opts),
    getPublicUrl: (path) => bucket().getPublicUrl(path),
    createBucket: (name, opts) => supabase.storage.createBucket(name, opts),
    updateBucket: (name, opts) => supabase.storage.updateBucket(name, opts),
  };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = body?.prompt || body?.text;
    const env = {
      CLOUDFLARE_ACCOUNT_ID: Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "",
      CLOUDFLARE_API_TOKEN: Deno.env.get("CLOUDFLARE_API_TOKEN") || "",
      CLOUDFLARE_IMAGE_MODEL: Deno.env.get("CLOUDFLARE_IMAGE_MODEL") || "",
      FLUXAPI_KEY: Deno.env.get("FLUXAPI_KEY") || "",
      FLUXAPI_MODEL: Deno.env.get("FLUXAPI_MODEL") || "",
      FAL_KEY: Deno.env.get("FAL_KEY") || "",
      GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") || "",
      GEMINI_IMAGE_MODEL: Deno.env.get("GEMINI_IMAGE_MODEL") || "",
      OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY") || "",
      OPENAI_IMAGE_MODEL: Deno.env.get("OPENAI_IMAGE_MODEL") || "",
    };
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const result = await generateAndStore(String(prompt || ""), env, {
      storage: storageOf(supabase),
      cache: body?.cache !== false,
      seed: Number.isInteger(body?.seed) ? body.seed : 42,
    });
    return json(result);
  } catch (err: any) {
    const status = err instanceof ImageGenError ? err.httpStatus : 500;
    return json({ error: err?.message || String(err) }, status);
  }
});
