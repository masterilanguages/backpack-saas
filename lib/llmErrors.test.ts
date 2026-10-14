/// <reference lib="deno.ns" />

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLlmError, isAccountLlmError } from "./llmErrors.ts";

// Exactly what prepareChapter logged on 2026-10-14.
const CREDIT_MESSAGE = `400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011Cg1XhazM2vwYnB29DSdEm"}`;

Deno.test("out of credit, as a plain message", () => {
  assertEquals(classifyLlmError(new Error(CREDIT_MESSAGE)), "credit");
});

Deno.test("out of credit, as the SDK's APIError (status 400, not a generic bad request)", () => {
  const e = Object.assign(new Error(CREDIT_MESSAGE), {
    status: 400,
    error: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
  });
  assertEquals(classifyLlmError(e), "credit");
  assertEquals(isAccountLlmError(classifyLlmError(e)), true);
});

Deno.test("bad or missing API key", () => {
  assertEquals(classifyLlmError(Object.assign(new Error("401 invalid x-api-key"), { status: 401 })), "auth");
  assertEquals(classifyLlmError(new Error("ANTHROPIC_API_KEY is not set")), "auth");
});

Deno.test("temporary failures are not account failures", () => {
  const rate = classifyLlmError(Object.assign(new Error("429 rate_limit_error"), { status: 429 }));
  const busy = classifyLlmError(Object.assign(new Error("529 overloaded_error"), { status: 529 }));
  const slow = classifyLlmError(new Error("Request timed out."));
  assertEquals([rate, busy, slow], ["rate_limit", "overloaded", "timeout"]);
  for (const k of [rate, busy, slow]) assertEquals(isAccountLlmError(k), false);
});

Deno.test("other 400s (e.g. an unknown model) are bad requests", () => {
  assertEquals(classifyLlmError(Object.assign(new Error(`404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}}`), { status: 404 })), "bad_request");
  assertEquals(classifyLlmError(new Error("The model returned no JSON")), "unknown");
});
