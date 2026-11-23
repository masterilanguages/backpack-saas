// Decides whether the scheduled monitor should fail. No secrets are included
// in the detail string. The website check and the Claude check are separate:
// a site that is up can still fail when Claude is out of credits.

import {
  aiProbeLooksConfigured,
  explainAiFailure,
  healthEndpoint,
  parseAiProbe,
  pingAnthropic,
  redactSecrets,
  type FetchLike,
} from "./aiHealth";

export type ProductionCheckResult = {
  ok: boolean;
  site: "up" | "down";
  ai: "ok" | "failed" | "not_checked";
  detail: string;
};

function finish(result: ProductionCheckResult): ProductionCheckResult {
  return { ...result, detail: redactSecrets(result.detail) };
}

function shortErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return redactSecrets(msg).slice(0, 200);
}

export async function runProductionCheck(opts: {
  productionUrl?: string;
  healthCheckToken?: string;
  anthropicApiKey?: string;
  fetchImpl?: FetchLike;
}): Promise<ProductionCheckResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let endpoint: string;
  try {
    endpoint = healthEndpoint(opts.productionUrl);
  } catch (e) {
    return finish({ ok: false, site: "down", ai: "not_checked", detail: shortErr(e) });
  }

  let siteRes: Response;
  let siteText: string;
  try {
    siteRes = await fetchImpl(endpoint, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    siteText = await siteRes.text();
  } catch (e) {
    return finish({
      ok: false,
      site: "down",
      ai: "not_checked",
      detail: `Could not reach ${endpoint}. The site may be down. (${shortErr(e)})`,
    });
  }

  let siteJson: { status?: string } | null;
  try {
    siteJson = JSON.parse(siteText);
  } catch {
    siteJson = null;
  }
  if (!siteRes.ok || !siteJson || siteJson.status !== "ok") {
    return finish({
      ok: false,
      site: "down",
      ai: "not_checked",
      detail: `The health check at ${endpoint} did not report status ok (HTTP ${siteRes.status}). ${redactSecrets(siteText).slice(0, 180)}`,
    });
  }

  const token = (opts.healthCheckToken || "").trim();
  const key = (opts.anthropicApiKey || "").trim();

  if (token) {
    let aiRes: Response;
    let aiText: string;
    try {
      aiRes = await fetchImpl(`${endpoint}?ai=1`, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${token}` },
      });
      aiText = await aiRes.text();
    } catch (e) {
      return finish({
        ok: false,
        site: "up",
        ai: "failed",
        detail: `The site is up, but the AI check request failed. (${shortErr(e)})`,
      });
    }
    if (aiRes.status >= 300 && aiRes.status < 400) {
      return finish({
        ok: false,
        site: "up",
        ai: "failed",
        detail: `The AI check was redirected (HTTP ${aiRes.status}). Set PRODUCTION_URL to https://www.backpacksystems.com so the monitor token is not sent anywhere else.`,
      });
    }
    const probe = parseAiProbe(aiText);
    if (probe && aiProbeLooksConfigured(probe)) {
      if (probe.ok) {
        return finish({
          ok: true,
          site: "up",
          ai: "ok",
          detail: "The site is up, and the production server confirmed Claude accepted a one-token check.",
        });
      }
      return finish({ ok: false, site: "up", ai: "failed", detail: explainAiFailure(probe) });
    }
  }

  if (key) {
    const ai = await pingAnthropic(key, fetchImpl);
    if (!ai.ok) return finish({ ok: false, site: "up", ai: "failed", detail: explainAiFailure(ai) });
    return finish({
      ok: true,
      site: "up",
      ai: "ok",
      detail: "The site is up, and Claude accepted a one-token check using the ANTHROPIC_API_KEY stored in GitHub. That key must belong to the same Anthropic account the app uses, because credits are shared by the account.",
    });
  }

  return finish({
    ok: true,
    site: "up",
    ai: "not_checked",
    detail: "The website is up. Claude credits are NOT being checked yet, so another \"credit balance too low\" outage would stay silent. Add the ANTHROPIC_API_KEY secret described in README.md.",
  });
}
