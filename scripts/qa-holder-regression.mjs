/**
 * Regression: holder concentration after fix.
 * Run: node scripts/qa-holder-regression.mjs
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

const TOKENS = {
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
};

const client = await MongoClient.connect(env.MONGO_URL);
const user = await client.db(env.DB_NAME || "solguard").collection("users").findOne({});
const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function runAgent(agentId, tokenAddress) {
  const r = await fetch(`http://localhost:3000/api/agents/${agentId}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: { tokenAddress }, paymentMethod: "testing" }),
  });
  return { status: r.status, body: await r.json() };
}

for (const [name, mint] of Object.entries(TOKENS)) {
  console.log("\n" + "=".repeat(55));
  console.log(`TOKEN: ${name}`);
  for (const agentId of ["bundle-detection", "holder-distribution", "contract-security"]) {
    const { status, body } = await runAgent(agentId, mint);
    const res = body.result || body;
    const holderFindings = (res.keyFindings || []).filter((f) => /holder/i.test(f.label));
    console.log(`\n${agentId} [${status}]`);
    console.log("  verdict:", (res.verdict || res.summary || "").slice(0, 120));
    console.log("  confidence:", res.confidence);
    for (const f of holderFindings) {
      console.log(`  ${f.label}: ${f.value} (${f.impact})`);
    }
    if (res.rawEvidence?.holderDataAvailable !== undefined) {
      console.log("  raw holderDataAvailable:", res.rawEvidence.holderDataAvailable);
      console.log("  raw topHolder/top10:", res.rawEvidence.topHolderPercent, res.rawEvidence.top10Percent);
    }
  }
}

await client.close();
