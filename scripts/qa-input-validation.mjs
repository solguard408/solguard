/**
 * QA: schema-based input validation via live API sanitize path.
 * Run with dev server: node scripts/qa-input-validation.mjs
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

const client = await MongoClient.connect(env.MONGO_URL);
const user = await client.db(env.DB_NAME || "solguard").collection("users").findOne({});
const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
await client.close();

const BASE = "http://localhost:3000/api";
const AUTH = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const cases = [
  {
    service: "cyber-consultant",
    agent: "ai-consultant",
    valid: { query: "What is the most common Solana token rug-pull pattern in 2025?" },
    stray: { query: "What is the most common Solana token rug-pull pattern in 2025?", url: "plain text not a url" },
  },
  {
    service: "dapp-frontend-verification",
    agent: "website-security",
    valid: { url: "https://solana.com" },
    invalid: { url: "What is the most common Solana token rug-pull pattern in 2025?" },
    invalidIncludes: "must start with http",
  },
  {
    service: "openclaw-ai-agent-verification",
    agent: "openclaw-ai-agent-verification",
    valid: { config: '{"name":"agent","gateway":{"auth":"token"}}' },
  },
  {
    service: "private-data-verification",
    agent: "private-data-verification",
    valid: { cpdv_data: "customer-record-8842" },
  },
  {
    service: "quantum-cryptography-verification",
    agent: "quantum-cryptography-verification",
    valid: { cqcv_data: "my-secret-plan" },
  },
  {
    service: "solana-token-verification",
    agent: "solana-token-verification",
    valid: { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    invalid: { tokenAddress: "not-an-address" },
    invalidIncludes: "valid Solana address",
  },
  {
    service: "wallet-verification",
    agent: "wallet-verification",
    valid: { walletAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" },
  },
  {
    service: "smart-contract-audit",
    agent: "contract-security",
    valid: { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  },
];

async function probe(agentId, inputs) {
  const r = await fetch(`${BASE}/agents/${agentId}/run`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ inputs, paymentMethod: "usdc" }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, error: j.error || null };
}

let ok = 0;
let fail = 0;

for (const c of cases) {
  const svc = await fetch(`${BASE}/services/${c.service}`).then((r) => r.json());
  const inputKeys = (svc.agent?.inputs || []).map((i) => i.key).join(",");
  console.log(`\n${c.service} → ${c.agent} [${inputKeys}]`);

  const valid = await probe(c.agent, c.valid);
  if (valid.status !== 402) {
    console.log(`  FAIL valid probe: expected 402 (no payment), got ${valid.status} ${valid.error}`);
    fail++;
    continue;
  }
  if (valid.error?.toLowerCase().includes("url") && valid.error?.includes("http")) {
    console.log(`  FAIL valid probe got URL error: ${valid.error}`);
    fail++;
    continue;
  }
  console.log(`  OK valid input → ${valid.status} (${valid.error || "no sanitize error"})`);
  ok++;

  if (c.stray) {
    const stray = await probe(c.agent, c.stray);
    if (stray.error?.toLowerCase().includes("invalid url") || stray.error?.toLowerCase().includes("must start with http")) {
      console.log(`  FAIL stray url key: ${stray.error}`);
      fail++;
    } else {
      console.log(`  OK stray url key ignored → ${stray.status}`);
      ok++;
    }
  }

  if (c.invalid) {
    const bad = await probe(c.agent, c.invalid);
    if (bad.status !== 400 || !bad.error || !c.invalidIncludes || !bad.error.toLowerCase().includes(c.invalidIncludes.toLowerCase())) {
      console.log(`  FAIL invalid input: expected 400 "${c.invalidIncludes}", got ${bad.status} ${bad.error}`);
      fail++;
    } else {
      console.log(`  OK invalid input → ${bad.error}`);
      ok++;
    }
  }
}

console.log(`\n${ok} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
