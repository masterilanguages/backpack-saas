// Mnemonic pictures: current image models, one retry on a blip, then the next
// provider. The bytes are stored once; the same prompt returns that URL instead
// of being drawn again.
//
// Provider order (set the matching secret; leave it unset to skip):
//   1. CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
//        FLUX.1 schnell (JSON, no seed). FLUX.2 klein only when
//        CLOUDFLARE_IMAGE_MODEL contains "flux-2"; a failure there falls back
//        to schnell, still without seed.
//   2. FLUXAPI_KEY     FLUX.1 Kontext via fluxapi.ai (FLUXAPI_MODEL)
//   3. FAL_KEY         FLUX schnell on fal.ai
//   4. GEMINI_API_KEY  gemini-nano-banana-2.1, then gemini-2.5-flash-image
//   5. OPENAI_API_KEY  gpt-image-2.6-flare (gpt-image-1 was shut down 2026-10-23)
//
// OPENAI_IMAGE_MODEL / GEMINI_IMAGE_MODEL / CLOUDFLARE_IMAGE_MODEL override the pick.
// A retired OpenAI id in the environment is ignored.

export const CLOUDFLARE_KLEIN = "@cf/black-forest-labs/flux-2-klein-4b";
export const CLOUDFLARE_SCHNELL = "@cf/black-forest-labs/flux-1-schnell";
export const OPENAI_IMAGE_MODEL = "gpt-image-2.6-flare";
export const GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const GEMINI_IMAGE_FALLBACK = "gemini-2.5-flash-image";

const RETIRED_OPENAI = new Set([
  "gpt-image-1",
  "gpt-image-1-mini",
  "dall-e-2",
  "dall-e-3",
  "chatgpt-image-latest",
]);

const FAL_FLUX_URL = "https://fal.run/fal-ai/flux/schnell";
const FLUXAPI_BASE = "https://api.fluxapi.ai/api/v1/flux/kontext";

export type ImageEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_IMAGE_MODEL?: string;
  FLUXAPI_KEY?: string;
  FLUXAPI_MODEL?: string;
  FAL_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_IMAGE_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
};

export type ImageBytes = { bytes: Uint8Array; mime: string };

export class ImageGenError extends Error {
  status: number | null;
  httpStatus: number;
  constructor(message: string, status: number | null = null, httpStatus = 502) {
    super(message);
    this.name = "ImageGenError";
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

export type StorageLike = {
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  upload(path: string, bytes: Uint8Array, opts: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  createBucket(name: string, opts: { public: boolean }): Promise<{ error: { message: string } | null }>;
  updateBucket?(name: string, opts: { public: boolean }): Promise<{ error: { message: string } | null }>;
};

export function resolveOpenAIImageModel(raw?: string | null): string {
  const id = String(raw || "").trim();
  if (!id || RETIRED_OPENAI.has(id) || id.startsWith("gpt-image-1")) return OPENAI_IMAGE_MODEL;
  return id;
}

export function resolveGeminiImageModel(raw?: string | null): string {
  const id = String(raw || "").trim();
  if (!id || id.includes("preview") || id === "gemini-2.0-flash-preview-image-generation") return GEMINI_IMAGE_MODEL;
  return id;
}

export function providerPlan(env: ImageEnv): string[] {
  const out: string[] = [];
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) out.push("cloudflare");
  if (env.FLUXAPI_KEY) out.push("fluxapi");
  if (env.FAL_KEY) out.push("fal");
  if (env.GEMINI_API_KEY) out.push("gemini");
  if (env.OPENAI_API_KEY) out.push("openai");
  return out;
}

export function fitImagePrompt(prompt: string, max: number): string {
  const text = String(prompt || "").trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

export function isTransientImageError(status: number | null, message: string): boolean {
  if (status != null && [408, 429, 500, 502, 503, 504].includes(status)) return true;
  return /timeout|timed out|overloaded|rate limit|temporarily|econnreset|network|fetch failed/i.test(message);
}

export function cloudflareModelUnsupported(status: number | null, message: string): boolean {
  if (status === 404 || status === 410 || status === 400) return true;
  return /multipart|unknown model|not found|deprecated|gone|5006/i.test(message);
}

export async function promptCacheKey(prompt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extFor(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

async function withRetries<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
  attempts = 2,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = e instanceof ImageGenError ? e.status : null;
      const message = e instanceof Error ? e.message : String(e);
      if (i === attempts - 1 || !isTransientImageError(status, message)) throw e;
      await sleep(400 * (i + 1));
    }
  }
  throw last;
}

async function readImageResponse(resp: Response, label: string): Promise<ImageBytes> {
  if (!resp.ok) {
    const errText = await resp.text();
    throw new ImageGenError(`${label} failed (${resp.status}): ${errText.slice(0, 500)}`, resp.status);
  }
  const ctype = resp.headers.get("content-type") || "";
  if (ctype.startsWith("image/")) {
    return { bytes: new Uint8Array(await resp.arrayBuffer()), mime: ctype.split(";")[0] };
  }
  const data = await resp.json();
  const b64 = data?.result?.image || data?.image || data?.data?.[0]?.b64_json;
  if (typeof b64 === "string" && b64.length > 0) {
    const mime = ctype.includes("png") ? "image/png" : "image/jpeg";
    return { bytes: b64ToBytes(b64), mime };
  }
  const url = data?.images?.[0]?.url || data?.data?.[0]?.url || data?.url;
  if (typeof url === "string") {
    const img = await fetch(url);
    if (!img.ok) throw new ImageGenError(`${label} image download failed (${img.status})`, img.status);
    const mime = img.headers.get("content-type") || "image/jpeg";
    return { bytes: new Uint8Array(await img.arrayBuffer()), mime: mime.split(";")[0] };
  }
  throw new ImageGenError(`${label} returned no image`);
}

async function cloudflareCall(
  model: string,
  prompt: string,
  env: ImageEnv,
  fetchImpl: typeof fetch,
  seed: number,
): Promise<ImageBytes> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
  const klein = model.includes("flux-2") || model.includes("klein");
  let resp: Response;
  if (klein) {
    const form = new FormData();
    form.append("prompt", fitImagePrompt(prompt, 4000));
    form.append("width", "1024");
    form.append("height", "1024");
    form.append("seed", String(seed));
    resp = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, body: form });
  } else {
    // schnell rejects `seed` ("Additional properties '/seed' not allowed").
    resp = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: fitImagePrompt(prompt, 2000), steps: 4 }),
    });
  }
  return readImageResponse(resp, `Cloudflare ${model}`);
}

function cloudflareModel(env: ImageEnv): string {
  const requested = String(env.CLOUDFLARE_IMAGE_MODEL || "").trim();
  if (/flux-2|klein/i.test(requested)) {
    return requested.startsWith("@cf/") ? requested : CLOUDFLARE_KLEIN;
  }
  return CLOUDFLARE_SCHNELL;
}

async function generateCloudflare(prompt: string, env: ImageEnv, fetchImpl: typeof fetch, seed: number): Promise<ImageBytes> {
  const preferred = cloudflareModel(env);
  try {
    return await cloudflareCall(preferred, prompt, env, fetchImpl, seed);
  } catch (e) {
    const status = e instanceof ImageGenError ? e.status : null;
    const message = e instanceof Error ? e.message : String(e);
    if (preferred === CLOUDFLARE_SCHNELL || !cloudflareModelUnsupported(status, message)) throw e;
    return cloudflareCall(CLOUDFLARE_SCHNELL, prompt, env, fetchImpl, seed);
  }
}

async function generateFluxApi(prompt: string, env: ImageEnv, fetchImpl: typeof fetch): Promise<ImageBytes> {
  const model = env.FLUXAPI_MODEL || "flux-kontext-pro";
  const gen = await fetchImpl(`${FLUXAPI_BASE}/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.FLUXAPI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: fitImagePrompt(prompt, 4000), model, aspectRatio: "1:1", outputFormat: "jpeg" }),
  });
  if (!gen.ok) throw new ImageGenError(`FluxAPI generate failed (${gen.status}): ${(await gen.text()).slice(0, 300)}`, gen.status);
  const taskId = (await gen.json())?.data?.taskId;
  if (!taskId) throw new ImageGenError("FluxAPI returned no taskId");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetchImpl(`${FLUXAPI_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${env.FLUXAPI_KEY}` },
    });
    if (!poll.ok) continue;
    const d = (await poll.json())?.data;
    const imgUrl = d?.response?.resultImageUrl;
    if (imgUrl) return readImageResponse(await fetchImpl(imgUrl), "FluxAPI");
    if (d?.errorCode || d?.errorMessage) throw new ImageGenError(`FluxAPI generation error: ${d.errorMessage || d.errorCode}`);
  }
  throw new ImageGenError("FluxAPI timed out waiting for the image", 504);
}

async function generateFal(prompt: string, env: ImageEnv, fetchImpl: typeof fetch, seed: number): Promise<ImageBytes> {
  const resp = await fetchImpl(FAL_FLUX_URL, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: fitImagePrompt(prompt, 4000),
      seed,
      image_size: "square_hd",
      num_inference_steps: 4,
      num_images: 1,
    }),
  });
  return readImageResponse(resp, "Flux");
}

async function geminiOnce(prompt: string, model: string, apiKey: string, fetchImpl: typeof fetch): Promise<ImageBytes> {
  const resp = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fitImagePrompt(prompt, 8000) }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
  );
  if (!resp.ok) {
    throw new ImageGenError(`Gemini image failed (${resp.status}): ${(await resp.text()).slice(0, 400)}`, resp.status);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data;
    if (inline?.data) {
      return { bytes: b64ToBytes(inline.data), mime: inline.mimeType || inline.mime_type || "image/png" };
    }
  }
  const txt = parts.map((p: any) => p?.text).filter(Boolean).join(" ");
  throw new ImageGenError(`Gemini returned no image${txt ? ": " + txt.slice(0, 200) : ""}`);
}

async function generateGemini(prompt: string, env: ImageEnv, fetchImpl: typeof fetch): Promise<ImageBytes> {
  const primary = resolveGeminiImageModel(env.GEMINI_IMAGE_MODEL);
  try {
    return await geminiOnce(prompt, primary, env.GEMINI_API_KEY || "", fetchImpl);
  } catch (e) {
    const status = e instanceof ImageGenError ? e.status : null;
    if (primary === GEMINI_IMAGE_FALLBACK || (status !== 404 && status !== 400)) throw e;
    return geminiOnce(prompt, GEMINI_IMAGE_FALLBACK, env.GEMINI_API_KEY || "", fetchImpl);
  }
}

async function generateOpenAI(prompt: string, env: ImageEnv, fetchImpl: typeof fetch): Promise<ImageBytes> {
  const model = resolveOpenAIImageModel(env.OPENAI_IMAGE_MODEL);
  const resp = await fetchImpl("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: fitImagePrompt(prompt, 32000), size: "1024x1024", n: 1 }),
  });
  return readImageResponse(resp, "OpenAI");
}

async function runProvider(name: string, prompt: string, env: ImageEnv, fetchImpl: typeof fetch, seed: number): Promise<ImageBytes> {
  if (name === "cloudflare") return generateCloudflare(prompt, env, fetchImpl, seed);
  if (name === "fluxapi") return generateFluxApi(prompt, env, fetchImpl);
  if (name === "fal") return generateFal(prompt, env, fetchImpl, seed);
  if (name === "gemini") return generateGemini(prompt, env, fetchImpl);
  if (name === "openai") return generateOpenAI(prompt, env, fetchImpl);
  throw new ImageGenError(`Unknown image provider ${name}`);
}

export async function generateImageBytes(
  prompt: string,
  env: ImageEnv,
  deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; seed?: number } = {},
): Promise<{ image: ImageBytes; source: string }> {
  const fetchImpl = deps.fetch || fetch;
  const sleep = deps.sleep || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const plan = providerPlan(env);
  if (!plan.length) {
    throw new ImageGenError(
      "No image provider configured (set CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_API_TOKEN, FLUXAPI_KEY, FAL_KEY, GEMINI_API_KEY or OPENAI_API_KEY)",
      null,
      500,
    );
  }
  const errors: string[] = [];
  for (const name of plan) {
    try {
      const image = await withRetries(() => runProvider(name, prompt, env, fetchImpl, deps.seed ?? 42), sleep);
      return { image, source: name };
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new ImageGenError(`All image providers failed. ${errors.join(" | ")}`.slice(0, 900));
}

async function publicUrl(storage: StorageLike, path: string): Promise<string> {
  const url = storage.getPublicUrl(path)?.data?.publicUrl;
  if (!url) throw new ImageGenError("Upload succeeded but no public URL was returned", null, 500);
  return url;
}

async function uploadPublic(storage: StorageLike, path: string, image: ImageBytes): Promise<string> {
  const put = () => storage.upload(path, image.bytes, { contentType: image.mime, upsert: true });
  let { error } = await put();
  if (error && /bucket not found|does not exist/i.test(error.message)) {
    const created = await storage.createBucket("uploads", { public: true });
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw new ImageGenError(`Upload failed: ${error.message}; could not create the uploads bucket: ${created.error.message}`, null, 500);
    }
    ({ error } = await put());
  }
  if (error) throw new ImageGenError(`Upload failed: ${error.message}`, null, 500);
  if (storage.updateBucket) {
    try { await storage.updateBucket("uploads", { public: true }); } catch { /* public flag is also set by migration 2300 */ }
  }
  return publicUrl(storage, path);
}

/**
 * Return a stored picture for this prompt, or generate one and store it.
 * `cache: false` always draws a new picture (the regenerate button).
 */
export async function generateAndStore(
  prompt: string,
  env: ImageEnv,
  deps: {
    storage: StorageLike;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    seed?: number;
    cache?: boolean;
    randomId?: () => string;
  },
): Promise<{ url: string; source: string; cached: boolean }> {
  const text = String(prompt || "").trim();
  if (!text) throw new ImageGenError("Missing 'prompt'", null, 400);
  const key = await promptCacheKey(text);
  const cachedPath = `generated/by-prompt/${key}`;
  if (deps.cache !== false) {
    const existing = await deps.storage.download(cachedPath);
    if (existing.data && !existing.error) return { url: await publicUrl(deps.storage, cachedPath), source: "cache", cached: true };
  }
  const { image, source } = await generateImageBytes(text, env, deps);
  const path = deps.cache === false
    ? `generated/${deps.randomId ? deps.randomId() : crypto.randomUUID()}.${extFor(image.mime)}`
    : cachedPath;
  const url = await uploadPublic(deps.storage, path, image);
  return { url, source, cached: false };
}
