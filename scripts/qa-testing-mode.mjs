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

const base = "http://localhost:3000/api";
const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const user = await db.collection("users").findOne({});
const creditsBefore = user.credits ?? 0;
const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

const cfg = await fetch(`${base}/config`).then((r) => r.json());
console.log("config:", cfg);

const agents = [
  { id: "contract-security", inputs: { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" } },
  { id: "wallet-verification", inputs: { walletAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" } },
  { id: "website-security", inputs: { url: "https://solana.com" } },
  { id: "ai-consultant", inputs: { query: "What is a Solana rug pull in one sentence?" } },
];

console.log("\n=== 4 free agent runs (paymentMethod: testing) ===");
for (const a of agents) {
  const r = await fetch(`${base}/agents/${a.id}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: a.inputs, paymentMethod: "testing" }),
  });
  const body = await r.json();
  console.log(`${a.id}: ${r.status}`, r.status === 200 ? "OK" : body.error);
}

const after = await db.collection("users").findOne({ id: user.id });
console.log("\ncredits unchanged:", after.credits === creditsBefore, `(${creditsBefore} -> ${after.credits})`);

console.log("\n=== Rate limit probe (25 rapid nonce — separate endpoint) ===");
let limited = 0;
for (let i = 0; i < 25; i++) {
  const r = await fetch(`${base}/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: user.walletAddress }),
  });
  if (r.status === 429) limited++;
}
console.log("429 responses:", limited, limited >= 1 ? "PASS (rate limit active)" : "FAIL");

await client.close();
