// Scheduled outage check. Prints a plain-English result and exits 1 when the
// site is down or Claude rejects the account (out of credits, bad key, ...).
// Exits 0 when the site is up, including when the Claude key has not been
// added yet — that case is a warning, not a failure, so it does not send an
// email every 30 minutes before setup is finished.
import fs from "node:fs";
import process from "node:process";
import { runProductionCheck } from "../lib/productionHealth";

async function main() {
  const result = await runProductionCheck({
    productionUrl: process.env.PRODUCTION_URL,
    healthCheckToken: process.env.HEALTH_CHECK_TOKEN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const line = result.detail.replace(/\r?\n/g, " ");
  console.log(line);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const heading = result.ok ? "OK" : "FAILED";
    fs.appendFileSync(summaryPath, `### Production health: ${heading}\n\n${line}\n`);
  }

  if (!result.ok) {
    console.error(`::error::${line}`);
    process.exit(1);
  }
  if (result.ai === "not_checked") {
    console.warn(`::warning::${line}`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`::error::${message}`);
  process.exit(1);
});
