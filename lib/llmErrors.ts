// What kind of failure an Anthropic API call hit, so callers can decide what
// is worth doing next. Out of credit / bad key fail for EVERY model of the
// account, so falling back to another model or retrying only wastes calls;
// overload / rate limits / timeouts are temporary.
//
// Works on the SDK's APIError (status + error body) and on plain messages,
// e.g. `400 {"type":"error","error":{"type":"invalid_request_error",
// "message":"Your credit balance is too low to access the Anthropic API..."}}`.

export type LlmErrorKind = "credit" | "auth" | "rate_limit" | "overloaded" | "timeout" | "bad_request" | "unknown";

export function classifyLlmError(e: unknown): LlmErrorKind {
  const err: any = e;
  const status = Number(err?.status) || Number(String(err?.message || "").match(/^\s*(\d{3})\b/)?.[1]) || 0;
  const type = String(err?.error?.error?.type || err?.error?.type || "");
  const text = `${type} ${err?.message || ""} ${typeof e === "string" ? e : ""}`.toLowerCase();

  if (/credit balance|purchase credits|plans & billing|billing/.test(text)) return "credit";
  if (status === 401 || status === 403 || /authentication_error|permission_error|invalid x-api-key|api[ _]key/.test(text)) return "auth";
  if (status === 429 || /rate_limit/.test(text)) return "rate_limit";
  if (status === 529 || status === 503 || /overloaded/.test(text)) return "overloaded";
  if (/timed? ?out|timeout|aborted|econnreset|network|fetch failed/.test(text)) return "timeout";
  if (status === 400 || status === 404 || status === 413 || /invalid_request_error|not_found_error/.test(text)) return "bad_request";
  return "unknown";
}

/** Failures of the account itself: no other model or retry can succeed until someone fixes it. */
export const isAccountLlmError = (kind: LlmErrorKind) => kind === "credit" || kind === "auth";
