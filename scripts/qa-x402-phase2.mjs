/**
 * Phase 2 x402 QA — verify paywall + bypass for every x402-enabled agent.
 *
 * Requires dev server with X402_ENABLED_AGENTS set (use `all` for all 8 services).
 * Run: node scripts/qa-x402-phase2.mjs
 */
import { readFileSync } from "fs";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const BASE = "http://localhost:3000";

/** Minimal valid inputs per marketplace primary agent (from qa-all-services-free-run.mjs). */
const AGENT_INPUTS = {
  "ai-consultant": { query: "What is a Solana rug pull in one sentence?" },
  "wallet-verification": { walletAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" },
  "openclaw-ai-agent-verification": { config: '{"name":"agent","gateway":{"auth":"token"}}' },
  "solana-token-verification": { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  "private-data-verification": { cpdv_data: "customer-record-8842:status=verified" },
  "quantum-cryptography-verification": { cqcv_data: "confidential-api-key-rotation-schedule-2026" },
  "contract-security": { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  "website-security": { url: "https://solana.com" },
};

let passed = true;
const ok = (l) => console.log("  PASS:", l);
const fail = (l, d) => { console.log("  FAIL:", l, d || ""); passed = false; };

const cfg = await fetch(`${BASE}/api/config`).then((r) => r.json());
const x402Agents = cfg.x402Agents || [];
const testingOn = !!cfg.testingModeFreeRuns;
console.log(`x402Agents=[${x402Agents.join(", ")}] network=${cfg.x402Network || "?"} testing=${testingOn}\n`);

if (!x402Agents.length) {
  console.error("No x402 agents enabled — set X402_ENABLED_AGENTS=all (or list) and restart dev server");
  process.exit(1);
}

const nonX402 = Object.keys(AGENT_INPUTS).find((a) => !x402Agents.includes(a));

const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const users = db.collection("users");

const noCredit = {
  id: uuidv4(),
  walletAddress: randomBytes(32).toString("base64url").slice(0, 44),
  credits: 0,
  plan: "FREE",
  createdAt: new Date(),
};
const withCredit = {
  id: uuidv4(),
  walletAddress: randomBytes(32).toString("base64url").slice(0, 44),
  credits: 2,
  plan: "FREE",
  createdAt: new Date(),
};
await users.insertMany([noCredit, withCredit]);

function authFor(u) {
  const token = jwt.sign({ userId: u.id, walletAddress: u.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

try {
  for (const agentId of x402Agents) {
    const inputs = AGENT_INPUTS[agentId];
    if (!inputs) {
      fail(`agent ${agentId}`, "no test inputs defined");
      continue;
    }
    console.log(`--- ${agentId} ---`);

    if (!testingOn) {
      const r = await fetch(`${BASE}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: authFor(noCredit),
        body: JSON.stringify({ inputs, paymentMethod: "x402" }),
      });
      const hasHeader = !!(r.headers.get("payment-required"));
      if (r.status === 402 && hasHeader) ok(`${agentId}: 402 + PAYMENT-REQUIRED`);
      else fail(`${agentId}: paywall`, `status=${r.status} header=${hasHeader}`);
    } else {
      console.log("  (skip paywall — testing mode ON)");
    }

    if (testingOn) {
      const r = await fetch(`${BASE}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: authFor(noCredit),
        body: JSON.stringify({ inputs, paymentMethod: "x402" }),
      });
      if (r.status === 200) ok(`${agentId}: testing-mode bypass (200)`);
      else fail(`${agentId}: testing bypass`, `status=${r.status}`);
    } else {
      const before = (await users.findOne({ id: withCredit.id })).credits;
      const r = await fetch(`${BASE}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: authFor(withCredit),
        body: JSON.stringify({ inputs, paymentMethod: "credit" }),
      });
      const after = (await users.findOne({ id: withCredit.id })).credits;
      if (r.status === 200 && after === before - 1) ok(`${agentId}: credit bypass (${before}->${after})`);
      else fail(`${agentId}: credit bypass`, `status=${r.status} credits ${before}->${after}`);
    }
  }

  if (nonX402) {
    console.log(`--- isolation: ${nonX402} (not in x402 list) ---`);
    const r = await fetch(`${BASE}/api/agents/${nonX402}/run`, {
      method: "POST",
      headers: authFor(noCredit),
      body: JSON.stringify({
        inputs: AGENT_INPUTS[nonX402],
        paymentMethod: "usdc",
        paymentSignature: "invalid",
      }),
    });
    const hasHeader = !!(r.headers.get("payment-required"));
    if (!hasHeader) ok(`${nonX402}: manual USDC path (no PAYMENT-REQUIRED)`);
    else fail(`${nonX402}: leaked x402`, `status=${r.status}`);
  }
} finally {
  await users.deleteMany({ id: { $in: [noCredit.id, withCredit.id] } });
  await client.close();
}

console.log("\n=== SUMMARY ===");
console.log(passed ? "Phase 2 x402 checks passed." : "Some checks failed.");
process.exit(passed ? 0 : 1);
