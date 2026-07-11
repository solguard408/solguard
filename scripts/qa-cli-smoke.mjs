#!/usr/bin/env node
/**
 * Non-interactive CLI smoke test (no @clack prompts).
 * Usage: node scripts/qa-cli-smoke.mjs [baseUrl]
 */
import crypto from "crypto";
import { resolveBaseUrl, ensureConfig } from "../packages/solguard-cli/src/config.js";
import { ensureAuth, fetchConfig, fetchServices, runAgentFree } from "../packages/solguard-cli/src/api.js";
import { printReport } from "../packages/solguard-cli/src/output.js";

const BASE = (process.argv[2] || process.env.SOLGUARD_API || "http://localhost:3000/api").replace(/\/$/, "");

async function main() {
  console.log("CLI smoke test @", BASE);

  process.env.SOLGUARD_API = BASE;
  const config = ensureConfig();
  config.baseUrl = await resolveBaseUrl(config);
  console.log("resolved baseUrl:", config.baseUrl);

  const authed = await ensureAuth({ ...config, baseUrl: config.baseUrl });
  console.log("auth ok, credits:", authed.credits);

  const remoteConfig = await fetchConfig(config.baseUrl);
  const services = await fetchServices(config.baseUrl);
  console.log("services:", services.length);

  const paymentMethod = remoteConfig.testingModeFreeRuns ? "testing" : "credit";
  const agentId = "contract-security";
  const inputs = { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" };

  const report = await runAgentFree(config.baseUrl, authed.token, agentId, inputs, paymentMethod);
  printReport(report, { mode: "smoke-test", creditsRemaining: authed.credits - (paymentMethod === "credit" ? 1 : 0) });

  console.log("CLI smoke test PASSED");
}

main().catch((e) => {
  console.error("CLI smoke test FAILED:", e.message);
  process.exit(1);
});
