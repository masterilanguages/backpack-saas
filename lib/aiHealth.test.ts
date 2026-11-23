/// <reference lib="deno.ns" />
// The Claude credit check and the protected /api/health?ai=1 probe.
// No network: fetch is fake. Run with the rest of the suite (`npm test`).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aiProbeResponse,
  ANTHROPIC_MESSAGES_URL,
  healthEndpoint,
  messageFromProviderBody,
  pingAnthropic,
  publicHealthBody,
  secretsMatch,
  type FetchLike,
} from "./aiHealth.ts";

const CREDIT_BODY = JSON.stringify({
  type: "error",
  error: {
    type: "invalid_request_error",
    message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
  },
  request_id: "req_011Cg1XhazM2vwYnB29DSdEm",
});

Deno.test("public health body keeps the shape the live site already returns", () => {
  const body = publicHealthBody(new Date("2026-11-23T00:00:00.000Z"));
  assertEquals(Object.keys(body), ["status", "token", "timestamp"]);
  assertEquals(body, {
    status: "ok",
    token: "masteri-test-endtoken-2026",
    timestamp: "2026-11-23T00:00:00.000Z",
  });
});

Deno.test("secretsMatch fails closed on a missing token and ignores length early-exit tricks", () => {
  assertEquals(secretsMatch("secret", "secret"), true);
  assertEquals(secretsMatch("secret", "Secret"), false);
  assertEquals(secretsMatch("", "secret"), false);
  assertEquals(secretsMatch("secret", ""), false);
  assertEquals(secretsMatch("", ""), false);
  assertEquals(secretsMatch("a".repeat(513), "a".repeat(513)), false);
});

Deno.test("provider messages drop the request id and any API key", () => {
  const message = messageFromProviderBody(CREDIT_BODY);
  assert(message.includes("credit balance is too low"));
  assertEquals(message.includes("req_011"), false);
  const leaked = messageFromProviderBody('{"error":{"message":"bad sk-ant-examplekey"}}');
  assertEquals(leaked.includes("examplekey"), false);
  assert(leaked.includes("[redacted]"));
});

Deno.test("health URL is always https and always /api/health", () => {
  assertEquals(healthEndpoint(undefined), "https://www.backpacksystems.com/api/health");
  assertEquals(healthEndpoint("https://www.backpacksystems.com"), "https://www.backpacksystems.com/api/health");
  assertEquals(healthEndpoint("https://backpacksystems.com/api/health?ai=1"), "https://backpacksystems.com/api/health");
  let threw = false;
  try { healthEndpoint("http://www.backpacksystems.com"); } catch { threw = true; }
  assertEquals(threw, true);
});

function jsonFetch(status: number, body: string): FetchLike {
  return () => Promise.resolve(new Response(body, { status }));
}

Deno.test("a low credit balance is reported, and the key is not in the result", async () => {
  let sawKey = "";
  const fetchImpl: FetchLike = (url, init) => {
    assertEquals(url, ANTHROPIC_MESSAGES_URL);
    assertEquals(init?.redirect, "manual");
    assertEquals(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    sawKey = headers.get("x-api-key") || "";
    assertEquals(headers.get("authorization"), null);
    const body = JSON.parse(String(init?.body));
    assertEquals(body.model, "claude-haiku-4-5");
    assertEquals(body.max_tokens, 1);
    return Promise.resolve(new Response(CREDIT_BODY, { status: 400 }));
  };
  const ai = await pingAnthropic("sk-ant-secret", fetchImpl);
  assertEquals(sawKey, "sk-ant-secret");
  assertEquals(ai.ok, false);
  if (!ai.ok) {
    assertEquals(ai.kind, "credit");
    assert(ai.message.includes("credit balance is too low"));
    assertEquals(JSON.stringify(ai).includes("sk-ant-secret"), false);
    assertEquals(ai.message.includes("req_011"), false);
  }
});

Deno.test("a missing key does not call Claude", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = () => { calls++; return Promise.resolve(new Response("")); };
  const ai = await pingAnthropic(undefined, fetchImpl);
  assertEquals(calls, 0);
  assertEquals(ai.ok, false);
  if (!ai.ok) assertEquals(ai.kind, "not_configured");
});

Deno.test("?ai=1 without the token is 401 and does not call Claude", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = () => { calls++; return Promise.resolve(new Response("")); };
  const res = await aiProbeResponse({
    authorizationHeader: null,
    expectedToken: "secret",
    apiKey: "sk-ant-secret",
    fetchImpl,
  });
  assertEquals(calls, 0);
  assertEquals(res.status, 401);
  assertEquals(res.body, { status: "unauthorized" });
});

Deno.test("?ai=1 with the wrong token is 401", async () => {
  const res = await aiProbeResponse({
    authorizationHeader: "Bearer no",
    expectedToken: "secret",
    apiKey: "sk-ant-secret",
    fetchImpl: jsonFetch(200, "{}"),
  });
  assertEquals(res.status, 401);
});

Deno.test("?ai=1 with the token reports a credit failure as 503", async () => {
  const res = await aiProbeResponse({
    authorizationHeader: "bearer secret",
    expectedToken: "secret",
    apiKey: "sk-ant-secret",
    fetchImpl: jsonFetch(400, CREDIT_BODY),
    now: new Date("2026-11-23T00:00:00.000Z"),
  });
  assertEquals(res.status, 503);
  assertEquals(res.body.status, "error");
  if ("ai" in res.body && !res.body.ai.ok) assertEquals(res.body.ai.kind, "credit");
});

Deno.test("?ai=1 when the server has no key is 200 and not an outage", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = () => { calls++; return Promise.resolve(new Response("")); };
  const res = await aiProbeResponse({
    authorizationHeader: "Bearer secret",
    expectedToken: "secret",
    apiKey: undefined,
    fetchImpl,
  });
  assertEquals(calls, 0);
  assertEquals(res.status, 200);
  if ("ai" in res.body) assertEquals(res.body.ai.ok, false);
});

Deno.test("an HTTP 200 from Claude is success", async () => {
  const ai = await pingAnthropic("sk-ant-secret", jsonFetch(200, "{\"content\":[]}"));
  assertEquals(ai.ok, true);
});
