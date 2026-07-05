/**
 * Normal-mode validation QA (TESTING_MODE_FREE_RUNS=false).
 * Probes paymentMethod=usdc without signature — validation must pass (402), never URL error.
 */
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";
import { MongoClient } from "mongodb";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const BASE = "http://localhost:3000/api";

const SERVICES = [
  { service: "cyber-consultant", agent: "ai-consultant", inputs: { query: "What is the most common Solana token rug-pull pattern in 2025?" } },
  { service: "wallet-verification", agent: "wallet-verification", inputs: { walletAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" } },
  { service: "openclaw-ai-agent-verification", agent: "openclaw-ai-agent-verification", inputs: { config: '{"name":"agent","gateway":{"auth":"token"}}' } },
  { service: "solana-token-verification", agent: "solana-token-verification", inputs: { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" } },
  { service: "private-data-verification", agent: "private-data-verification", inputs: { cpdv_data: "customer-record-8842:status=verified" } },
  { service: "quantum-cryptography-verification", agent: "quantum-cryptography-verification", inputs: { cqcv_data: "confidential-api-key-rotation-schedule-2026" } },
  { service: "smart-contract-audit", agent: "contract-security", inputs: { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" } },
  { service: "dapp-frontend-verification", agent: "website-security", inputs: { url: "https://solana.com" } },
];

const cfg = await fetch(`${BASE}/config`).then((r) => r.json());
console.log("config:", cfg);
if (cfg.testingModeFreeRuns) {
  console.error("FAIL: set TESTING_MODE_FREE_RUNS=false and restart dev server");
  process.exit(1);
}

const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const user = await db.collection("users").findOne({}) || await db.collection("users").findOne();
if (!user) {
  console.error("No user in MongoDB — connect a wallet once via the UI to create one");
  await client.close();
  process.exit(1);
}
const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
await client.close();

console.log("\n=== Normal mode: valid inputs + paymentMethod=usdc (expect 402, not URL 400) ===\n");
let pass = 0;
let fail = 0;

for (const s of SERVICES) {
  const r = await fetch(`${BASE}/agents/${s.agent}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: s.inputs, paymentMethod: "usdc" }),
  });
  const body = await r.json().catch(() => ({}));
  const urlErr = body.error?.includes("Endpoint URL") || body.error?.includes("Website URL") || body.error?.includes("must start with http");
  const ok = r.status === 402 && !urlErr;
  console.log(`${ok ? "PASS" : "FAIL"} ${s.service} → ${r.status} ${body.error || ""}`);
  if (ok) pass++; else fail++;
}

console.log("\n=== dApp invalid URL (expect 400 URL error) ===");
const bad = await fetch(`${BASE}/agents/website-security/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    inputs: { url: "What is the most common Solana token rug-pull pattern in 2025?" },
    paymentMethod: "usdc",
  }),
}).then((r) => r.json());
const badOk = bad.error?.includes("Endpoint URL") || bad.error?.includes("must start with http");
console.log(`${badOk ? "PASS" : "FAIL"} invalid URL → ${bad.error}`);

console.log("\n=== Stray url key on consultant (expect 402, url ignored) ===");
const stray = await fetch(`${BASE}/agents/ai-consultant/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    inputs: { query: "What is the most common Solana token rug-pull pattern in 2025?", url: "not a url" },
    paymentMethod: "usdc",
  }),
});
const strayBody = await stray.json();
const strayOk = stray.status === 402 && !strayBody.error?.includes("must start with http");
console.log(`${strayOk ? "PASS" : "FAIL"} stray url key → ${stray.status} ${strayBody.error || ""}`);

console.log(`\n${pass}/${SERVICES.length} valid-input probes passed`);
process.exit(fail ? 1 : 0);
