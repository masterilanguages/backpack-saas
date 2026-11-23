/// <reference lib="deno.ns" />
// The scheduled monitor: site up/down, then a Claude credit check.
// No network. Database-backed tests are unrelated and stay skipped without TEST_DATABASE_URL.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ANTHROPIC_MESSAGES_URL, type FetchLike } from "./aiHealth.ts";
import { runProductionCheck } from "./productionHealth.ts";

const CREDIT_BODY = JSON.stringify({
  type: "error",
  error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." },
});

const SITE_OK = JSON.stringify({ status: "ok", token: "masteri-test-endtoken-2026", timestamp: "2026-11-23T00:00:00.000Z" });

function route(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): FetchLike {
  return (url, init) => Promise.resolve(handler(url, init));
}

Deno.test("the site being down fails the check and does not call Claude", async () => {
  let claude = 0;
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    anthropicApiKey: "sk-ant-secret",
    fetchImpl: route((url) => {
      if (url === ANTHROPIC_MESSAGES_URL) claude++;
      return new Response("nope", { status: 500 });
    }),
  });
  assertEquals(claude, 0);
  assertEquals(result.ok, false);
  assertEquals(result.site, "down");
  assert(result.detail.includes("did not report status ok"));
  assertEquals(result.detail.includes("sk-ant-secret"), false);
});

Deno.test("a reachable site with no Claude key is a warning, not a failure", async () => {
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    fetchImpl: route(() => new Response(SITE_OK, { status: 200 })),
  });
  assertEquals(result.ok, true);
  assertEquals(result.site, "up");
  assertEquals(result.ai, "not_checked");
  assert(result.detail.includes("NOT being checked"));
});

Deno.test("out of credits fails even though the website itself is up", async () => {
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    anthropicApiKey: "sk-ant-secret",
    fetchImpl: route((url) => {
      if (url === ANTHROPIC_MESSAGES_URL) return new Response(CREDIT_BODY, { status: 400 });
      return new Response(SITE_OK, { status: 200 });
    }),
  });
  assertEquals(result.ok, false);
  assertEquals(result.site, "up");
  assertEquals(result.ai, "failed");
  assert(result.detail.includes("out of credits"));
  assert(result.detail.includes("credit balance is too low"));
  assertEquals(result.detail.includes("sk-ant-secret"), false);
});

Deno.test("a working Claude key passes", async () => {
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    anthropicApiKey: "sk-ant-secret",
    fetchImpl: route((url, init) => {
      if (url === ANTHROPIC_MESSAGES_URL) {
        assertEquals(new Headers(init?.headers).get("x-api-key"), "sk-ant-secret");
        return new Response("{}", { status: 200 });
      }
      return new Response(SITE_OK, { status: 200 });
    }),
  });
  assertEquals(result.ok, true);
  assertEquals(result.ai, "ok");
});

Deno.test("the production server's own AI result wins, and a credit error is not ignored", async () => {
  let claude = 0;
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    healthCheckToken: "monitor-token",
    anthropicApiKey: "sk-ant-secret",
    fetchImpl: route((url, init) => {
      if (url === ANTHROPIC_MESSAGES_URL) { claude++; return new Response("{}", { status: 200 }); }
      if (url.endsWith("?ai=1")) {
        assertEquals(init?.redirect, "manual");
        assertEquals(new Headers(init?.headers).get("authorization"), "Bearer monitor-token");
        return new Response(JSON.stringify({
          status: "error",
          ai: { ok: false, kind: "credit", message: "Your credit balance is too low to access the Anthropic API.", model: "claude-haiku-4-5" },
        }), { status: 503 });
      }
      return new Response(SITE_OK, { status: 200 });
    }),
  });
  assertEquals(claude, 0);
  assertEquals(result.ok, false);
  assertEquals(result.ai, "failed");
  assert(result.detail.includes("out of credits"));
});

Deno.test("an old server without an AI field falls back to the GitHub key", async () => {
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    healthCheckToken: "monitor-token",
    anthropicApiKey: "sk-ant-secret",
    fetchImpl: route((url) => {
      if (url === ANTHROPIC_MESSAGES_URL) return new Response("{}", { status: 200 });
      // Old deployment: ?ai=1 is ignored and the public body comes back.
      return new Response(SITE_OK, { status: 200 });
    }),
  });
  assertEquals(result.ok, true);
  assertEquals(result.ai, "ok");
});

Deno.test("a server with no key of its own falls back to the GitHub key", async () => {
  const result = await runProductionCheck({
    productionUrl: "https://www.backpacksystems.com",
    healthCheckToken: "monitor-token",
    anthropicApiKey: "sk-ant-secret",
    fetchImpl: route((url) => {
      if (url === ANTHROPIC_MESSAGES_URL) return new Response(CREDIT_BODY, { status: 400 });
      if (url.endsWith("?ai=1")) {
        return new Response(JSON.stringify({
          status: "error",
          ai: { ok: false, kind: "not_configured", message: "ANTHROPIC_API_KEY is not set", model: "claude-haiku-4-5" },
        }), { status: 200 });
      }
      return new Response(SITE_OK, { status: 200 });
    }),
  });
  assertEquals(result.ok, false);
  assert(result.detail.includes("out of credits"));
});

Deno.test("a redirect on the protected AI check is a failure and does not follow", async () => {
  const result = await runProductionCheck({
    productionUrl: "https://backpacksystems.com",
    healthCheckToken: "monitor-token",
    fetchImpl: route((url) => {
      if (url.endsWith("?ai=1")) return new Response(null, { status: 302, headers: { Location: "https://evil.example/steal" } });
      return new Response(SITE_OK, { status: 200 });
    }),
  });
  assertEquals(result.ok, false);
  assert(result.detail.includes("redirected"));
  assertEquals(result.detail.includes("monitor-token"), false);
});

Deno.test("a non-https PRODUCTION_URL is rejected before any request", async () => {
  let calls = 0;
  const result = await runProductionCheck({
    productionUrl: "http://www.backpacksystems.com",
    fetchImpl: () => { calls++; return Promise.resolve(new Response(SITE_OK)); },
  });
  assertEquals(calls, 0);
  assertEquals(result.ok, false);
  assert(result.detail.includes("https://"));
});
