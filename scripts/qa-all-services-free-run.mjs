/**
 * QA: testing mode + all 8 marketplace services (validation + free runs).
 * Run with dev server: node scripts/qa-all-services-free-run.mjs
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
console.log("GET /api/config:", cfg);
if (!cfg.testingModeFreeRuns) {
  console.error("FAIL: testingModeFreeRuns is not true — restart dev server after .env change");
  process.exit(1);
}
console.log("OK: testingModeFreeRuns=true\n");

const noAuth = await fetch(`${BASE}/agents/ai-consultant/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ inputs: { query: "test question here please" }, paymentMethod: "testing" }),
});
console.log(`Unauthenticated run: ${noAuth.status} ${noAuth.status === 401 ? "OK (auth required)" : "FAIL"}\n`);

const client = await MongoClient.connect(env.MONGO_URL);
const user = await client.db(env.DB_NAME || "solguard").collection("users").findOne({});
const creditsBefore = user.credits ?? 0;
const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
await client.close();

let pass = 0;
let fail = 0;

for (const s of SERVICES) {
  const schema = await fetch(`${BASE}/services/${s.service}`).then((r) => r.json());
  const keys = (schema.agent?.inputs || []).map((i) => i.key).join(",");

  const r = await fetch(`${BASE}/agents/${s.agent}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: s.inputs, paymentMethod: "testing" }),
  });
  const body = await r.json().catch(() => ({}));
  const urlErr = body.error?.includes("Endpoint URL") || body.error?.includes("must start with http");
  const ok = r.status === 200 && !urlErr;

  console.log(`${ok ? "PASS" : "FAIL"} ${s.service} [${keys}] → ${r.status} ${body.error || body.reportId || body.verdict?.slice?.(0, 60) || "OK"}`);
  if (ok) pass++;
  else fail++;
}

const client2 = await MongoClient.connect(env.MONGO_URL);
const after = await client2.db(env.DB_NAME || "solguard").collection("users").findOne({ id: user.id });
await client2.close();
console.log(`\nCredits unchanged: ${after.credits === creditsBefore} (${creditsBefore} → ${after.credits})`);
console.log(`${pass}/${SERVICES.length} services passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
