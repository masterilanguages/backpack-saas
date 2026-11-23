// A one-token Claude call used only to detect account-level outages
// (credit balance too low, revoked key). It never writes student data.
// The same classifier as the chapter pipeline (lib/llmErrors) decides the kind.

import { classifyLlmError, type LlmErrorKind } from "./llmErrors";

export const AI_PING_MODEL = "claude-haiku-4-5";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Live /api/health body. Keys and the canary token stay as production returns them today. */
export function publicHealthBody(now = new Date()) {
  return {
    status: "ok" as const,
    token: "masteri-test-endtoken-2026",
    timestamp: now.toISOString(),
  };
}

export type AiHealthResult =
  | { ok: true; model: string }
  | { ok: false; kind: LlmErrorKind | "not_configured"; message: string; model: string };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_SECRET_LENGTH = 512;

export function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]");
}

/** Provider error text safe to put in a log or a JSON response. No request ids, no keys. */
export function messageFromProviderBody(body: string): string {
  let message = "";
  try {
    const parsed = JSON.parse(body);
    const fromJson = parsed?.error?.message || parsed?.message;
    if (typeof fromJson === "string") message = fromJson;
  } catch {
    message = "";
  }
  if (!message) message = body;
  return redactSecrets(message).replace(/\s+/g, " ").trim().slice(0, 300);
}

export function bearerToken(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

/** Constant-time compare. An empty expected token never matches, so a missing secret fails closed. */
export function secretsMatch(provided: string, expected: string): boolean {
  if (!expected || expected.length > MAX_SECRET_LENGTH || provided.length > MAX_SECRET_LENGTH) return false;
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function pingAnthropic(apiKey: string | undefined, fetchImpl: FetchLike = fetch): Promise<AiHealthResult> {
  const model = AI_PING_MODEL;
  if (!apiKey) {
    return { ok: false, kind: "not_configured", message: "ANTHROPIC_API_KEY is not set", model };
  }
  let res: Response;
  try {
    // redirect: "manual" so the API key is never forwarded to another host.
    res = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Reply with ok" }],
      }),
    });
  } catch (e) {
    const kind = classifyLlmError(e);
    return { ok: false, kind, message: "Could not reach the AI provider", model };
  }
  if (res.status >= 300 && res.status < 400) {
    return {
      ok: false,
      kind: "unknown",
      message: `AI provider returned a redirect (HTTP ${res.status}), which this check does not follow.`,
      model,
    };
  }
  if (res.ok) return { ok: true, model };
  const body = await res.text();
  const message = messageFromProviderBody(body) || `AI provider returned HTTP ${res.status}`;
  const kind = classifyLlmError({ status: res.status, message: `${res.status} ${message}` });
  return { ok: false, kind, message, model };
}

/** Origin or full URL → the public health endpoint. Rejects non-https URLs. */
export function healthEndpoint(productionUrl: string | undefined): string {
  const raw = (productionUrl || "").trim();
  const input = raw || "https://www.backpacksystems.com";
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("PRODUCTION_URL must be an https address, for example https://www.backpacksystems.com");
  }
  if (url.protocol !== "https:") {
    throw new Error("PRODUCTION_URL must start with https://. Example: https://www.backpacksystems.com");
  }
  if (url.username || url.password) {
    throw new Error("PRODUCTION_URL must not include a username or password.");
  }
  url.pathname = "/api/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** The `ai` object from /api/health?ai=1, or null when this server doesn't speak that yet. */
export function parseAiProbe(text: string): AiHealthResult | null {
  try {
    const parsed = JSON.parse(text);
    const ai = parsed?.ai;
    if (!ai || typeof ai.ok !== "boolean") return null;
    if (ai.ok === true) return { ok: true, model: String(ai.model || "") };
    const allowed = ["credit", "auth", "rate_limit", "overloaded", "timeout", "bad_request", "unknown", "not_configured"];
    const kind = allowed.includes(ai.kind) ? ai.kind : "unknown";
    return {
      ok: false,
      kind,
      message: redactSecrets(String(ai.message || "")).slice(0, 300),
      model: String(ai.model || ""),
    };
  } catch {
    return null;
  }
}

/** A "not_configured" probe means the server has no key; the monitor may use the GitHub secret instead. */
export function aiProbeLooksConfigured(ai: AiHealthResult): boolean {
  return ai.ok || ai.kind !== "not_configured";
}

export function explainAiFailure(ai: AiHealthResult): string {
  if (ai.ok) return "Claude answered a one-token check.";
  const quoted = ai.message ? ` (${ai.message})` : "";
  switch (ai.kind) {
    case "credit":
      return `Claude says the account is out of credits${quoted}. Student AI features are likely broken until credits are added at https://console.anthropic.com/settings/billing.`;
    case "auth":
      return `Claude rejected the API key${quoted}. The key used for this check may be wrong or revoked.`;
    case "not_configured":
      return "No ANTHROPIC_API_KEY is set, so credits were not checked.";
    case "rate_limit":
      return `Claude rate-limited the check${quoted}. If the next run fails too, look at the Anthropic status page.`;
    case "overloaded":
      return `Claude is overloaded${quoted}. If the next run fails too, look at the Anthropic status page.`;
    case "timeout":
      return `The Claude check timed out${quoted}. If the next run fails too, the provider may be unreachable.`;
    default:
      return `Claude check failed (${ai.kind})${quoted}.`;
  }
}

export type AiProbe =
  | { status: 401; body: { status: "unauthorized" } }
  | { status: number; body: { status: "ok" | "error"; timestamp: string; ai: AiHealthResult } };

/**
 * Auth-protected AI ping for /api/health?ai=1.
 * A missing or wrong token returns 401 and does not call Claude.
 * "not_configured" is HTTP 200 so a half-set-up server is not reported as an outage.
 * A real provider failure is HTTP 503.
 */
export async function aiProbeResponse(opts: {
  authorizationHeader: string | null;
  expectedToken: string | undefined;
  apiKey: string | undefined;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<AiProbe> {
  const provided = bearerToken(opts.authorizationHeader);
  if (!secretsMatch(provided, opts.expectedToken || "")) {
    return { status: 401, body: { status: "unauthorized" } };
  }
  const ai = await pingAnthropic(opts.apiKey, opts.fetchImpl);
  const status = ai.ok || ai.kind === "not_configured" ? 200 : 503;
  return {
    status,
    body: {
      status: ai.ok ? "ok" : "error",
      timestamp: (opts.now ?? new Date()).toISOString(),
      ai,
    },
  };
}
