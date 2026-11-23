/// <reference lib="deno.ns" />
// Run: deno test --unstable-sloppy-imports lib/mnemonicImageGen.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CLOUDFLARE_KLEIN,
  CLOUDFLARE_SCHNELL,
  GEMINI_IMAGE_FALLBACK,
  OPENAI_IMAGE_MODEL,
  b64ToBytes,
  fitImagePrompt,
  generateAndStore,
  generateImageBytes,
  promptCacheKey,
  providerPlan,
  resolveOpenAIImageModel,
  type StorageLike,
} from "./mnemonicImageGen.ts";

const TINY = btoa("mnemonic-picture-bytes");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function memoryStorage(): StorageLike & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async download(path) {
      const hit = files.get(path);
      if (!hit) return { data: null, error: { message: "not found" } };
      return { data: new Blob([hit.slice()]), error: null };
    },
    async upload(path, bytes) {
      files.set(path, bytes);
      return { error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `https://cdn.example/${path}` } };
    },
    async createBucket() {
      return { error: null };
    },
  };
}

Deno.test("a shut-down OpenAI image model is not used", () => {
  assertEquals(resolveOpenAIImageModel("gpt-image-1"), OPENAI_IMAGE_MODEL);
  assertEquals(resolveOpenAIImageModel("dall-e-3"), OPENAI_IMAGE_MODEL);
  assertEquals(resolveOpenAIImageModel(""), OPENAI_IMAGE_MODEL);
  assertEquals(resolveOpenAIImageModel("gpt-image-2.6-sunburst"), "gpt-image-2.6-sunburst");
});

Deno.test("providers run Cloudflare, then Gemini, then OpenAI", () => {
  assertEquals(
    providerPlan({
      CLOUDFLARE_ACCOUNT_ID: "a",
      CLOUDFLARE_API_TOKEN: "t",
      GEMINI_API_KEY: "g",
      OPENAI_API_KEY: "o",
    }),
    ["cloudflare", "gemini", "openai"],
  );
  assertEquals(providerPlan({}), []);
});

Deno.test("prompts are trimmed on a word boundary", () => {
  const long = "word ".repeat(50);
  const fit = fitImagePrompt(long, 40);
  assert(fit.length <= 40);
  assert(!fit.endsWith(" "));
});

Deno.test("the default Cloudflare model is FLUX.1 schnell and the body has no seed", async () => {
  let sent = "";
  let url = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    url = String(input);
    sent = String(init?.body);
    return jsonResponse({ result: { image: TINY } });
  };
  await generateImageBytes("a dog", {
    CLOUDFLARE_ACCOUNT_ID: "acct",
    CLOUDFLARE_API_TOKEN: "tok",
  }, { fetch: fetchImpl, sleep: async () => {} });
  assert(url.includes("flux-1-schnell"));
  const body = JSON.parse(sent);
  assertEquals(body.steps, 4);
  assertEquals("seed" in body, false);
});

Deno.test("FLUX.2 klein is requested as multipart and does not send steps", async () => {
  const calls: { url: string; body: BodyInit | null | undefined; contentType: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: init?.body,
      contentType: new Headers(init?.headers).get("content-type") || "",
    });
    return jsonResponse({ result: { image: TINY } });
  };
  const { source, image } = await generateImageBytes("a dog in a collar", {
    CLOUDFLARE_ACCOUNT_ID: "acct",
    CLOUDFLARE_API_TOKEN: "tok",
    CLOUDFLARE_IMAGE_MODEL: "flux-2-klein-4b",
  }, { fetch: fetchImpl, sleep: async () => {} });
  assertEquals(source, "cloudflare");
  assert(calls[0].url.includes(encodeURIComponent(CLOUDFLARE_KLEIN).replace(/%2F/g, "/") ) || calls[0].url.includes("flux-2-klein-4b"));
  assert(calls[0].body instanceof FormData);
  assertEquals(calls[0].contentType, "");
  assertEquals(image.bytes.byteLength, b64ToBytes(TINY).byteLength);
});

Deno.test("klein 400 falls through to FLUX.1 schnell without a seed", async () => {
  const bodies: string[] = [];
  let n = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    n += 1;
    if (n === 1) return jsonResponse({ errors: [{ message: "required properties at '/' are 'multipart'" }] }, 400);
    bodies.push(String(init?.body));
    return jsonResponse({ result: { image: TINY } });
  };
  const { source } = await generateImageBytes("scene", {
    CLOUDFLARE_ACCOUNT_ID: "acct",
    CLOUDFLARE_API_TOKEN: "tok",
    CLOUDFLARE_IMAGE_MODEL: "flux-2-klein-4b",
  }, { fetch: fetchImpl, sleep: async () => {} });
  assertEquals(source, "cloudflare");
  assert(bodies[0].includes(CLOUDFLARE_SCHNELL) === false);
  const sent = JSON.parse(bodies[0]);
  assertEquals(sent.steps, 4);
  assertEquals(sent.seed, undefined);
  assertEquals("seed" in sent, false);
});

Deno.test("a retired OpenAI model id in the environment still calls the current model", async () => {
  let sent = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    sent = String(init?.body);
    return jsonResponse({ data: [{ b64_json: TINY }] });
  };
  await generateImageBytes("scene", {
    OPENAI_API_KEY: "sk",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
  }, { fetch: fetchImpl, sleep: async () => {} });
  assertEquals(JSON.parse(sent).model, OPENAI_IMAGE_MODEL);
});

Deno.test("Gemini 404 tries the previous image model once", async () => {
  const models: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    models.push(url);
    if (models.length === 1) return jsonResponse({ error: { message: "not found" } }, 404);
    return jsonResponse({
      candidates: [{ content: { parts: [{ inlineData: { data: TINY, mimeType: "image/png" } }] } }],
    });
  };
  await generateImageBytes("scene", { GEMINI_API_KEY: "g" }, { fetch: fetchImpl, sleep: async () => {} });
  assert(models[0].includes("gemini-nano-banana-2.1"));
  assert(models[1].includes(GEMINI_IMAGE_FALLBACK));
});

Deno.test("a 503 is retried, then the next provider is used", async () => {
  let hits = 0;
  const fetchImpl: typeof fetch = async () => {
    hits += 1;
    if (hits < 3) return jsonResponse({ error: "unavailable" }, 503);
    return jsonResponse({ data: [{ b64_json: TINY }] });
  };
  const { source } = await generateImageBytes("scene", {
    GEMINI_API_KEY: "g",
    OPENAI_API_KEY: "sk",
  }, { fetch: fetchImpl, sleep: async () => {} });
  assertEquals(source, "openai");
  assert(hits >= 3);
});

Deno.test("no keys is a clear configuration error", async () => {
  let message = "";
  try {
    await generateImageBytes("scene", {}, { sleep: async () => {} });
  } catch (e) {
    message = e instanceof Error ? e.message : "";
  }
  assert(/No image provider configured/.test(message));
});

Deno.test("the same prompt is stored once and served from cache", async () => {
  const storage = memoryStorage();
  let draws = 0;
  const fetchImpl: typeof fetch = async () => {
    draws += 1;
    return jsonResponse({ result: { image: TINY } });
  };
  const env = { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t" };
  const first = await generateAndStore("a collar on a dog", env, { storage, fetch: fetchImpl, sleep: async () => {} });
  const second = await generateAndStore("a collar on a dog", env, { storage, fetch: fetchImpl, sleep: async () => {} });
  assertEquals(draws, 1);
  assertEquals(second.cached, true);
  assertEquals(second.url, first.url);
  const key = await promptCacheKey("a collar on a dog");
  assert(first.url.includes(key));
});

Deno.test("cache:false draws a new picture", async () => {
  const storage = memoryStorage();
  let draws = 0;
  const fetchImpl: typeof fetch = async () => {
    draws += 1;
    return jsonResponse({ result: { image: TINY } });
  };
  const env = { OPENAI_API_KEY: "sk" };
  await generateAndStore("scene", env, { storage, fetch: fetchImpl, sleep: async () => {}, randomId: () => "one" });
  await generateAndStore("scene", env, { storage, fetch: fetchImpl, sleep: async () => {}, cache: false, randomId: () => "two" });
  assertEquals(draws, 2);
});

Deno.test("a missing uploads bucket is created and the picture is still stored", async () => {
  const storage = memoryStorage();
  let uploads = 0;
  let created = 0;
  storage.upload = async (path, bytes) => {
    uploads += 1;
    if (uploads === 1) return { error: { message: "Bucket not found" } };
    storage.files.set(path, bytes);
    return { error: null };
  };
  storage.createBucket = async () => {
    created += 1;
    return { error: null };
  };
  const result = await generateAndStore("scene", { OPENAI_API_KEY: "sk" }, {
    storage,
    sleep: async () => {},
    fetch: async () => jsonResponse({ data: [{ b64_json: TINY }] }),
    randomId: () => "pic",
    cache: false,
  });
  assertEquals(created, 1);
  assert(result.url.includes("pic"));
});
