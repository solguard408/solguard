#!/usr/bin/env node
/**
 * QA: CLI anonymous auth + credit exhaustion (requires running API + MongoDB).
 * Usage: node scripts/qa-cli-auth.mjs [baseUrl]
 */
import crypto from "crypto";

const BASE = (process.argv[2] || process.env.SOLGUARD_API || "http://localhost:3000/api").replace(/\/$/, "");

async function req(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("QA CLI auth @", BASE);
  const cliInstallId = crypto.randomUUID();

  const reg1 = await req("/auth/cli", { method: "POST", body: { cliInstallId } });
  assert(reg1.ok, `register failed: ${reg1.status} ${JSON.stringify(reg1.data)}`);
  assert(reg1.data.token, "missing token");
  assert(reg1.data.user?.credits === 2, `expected 2 credits, got ${reg1.data.user?.credits}`);
  console.log("✓ new CLI user gets 2 credits");

  const reg2 = await req("/auth/cli", { method: "POST", body: { cliInstallId } });
  assert(reg2.ok, "re-register failed");
  assert(reg2.data.user?.credits === 2, "credits should not reset on re-register");
  console.log("✓ re-register does not reset credits");

  const token = reg1.data.token;
  const me = await req("/me", { token });
  assert(me.ok && me.data.cliInstallId === cliInstallId, "/me should return cliInstallId");
  console.log("✓ /me returns cliInstallId");

  const cfg = await req("/config");
  assert(cfg.ok, "config fetch failed");
  const paymentMethod = cfg.data.testingModeFreeRuns ? "testing" : "credit";

  // Use contract-security — fast, minimal deps
  const agentId = "contract-security";
  const inputs = { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" };

  for (let i = 1; i <= 2; i++) {
    const run = await req(`/agents/${agentId}/run`, {
      method: "POST",
      token,
      body: { inputs, paymentMethod },
    });
    assert(run.ok, `run ${i} failed: ${run.status} ${run.data?.error}`);
    console.log(`✓ run ${i} succeeded (risk ${run.data?.riskLevel})`);
  }

  if (paymentMethod === "credit") {
    const run3 = await req(`/agents/${agentId}/run`, {
      method: "POST",
      token,
      body: { inputs, paymentMethod: "credit" },
    });
    assert(run3.status === 402, `expected 402 on 3rd run, got ${run3.status}`);
    console.log("✓ 3rd credit run returns 402");
  } else {
    console.log("(skip 402 test — testing mode enabled)");
  }

  console.log("\nAll CLI auth QA checks passed.");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
