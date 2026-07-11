/**
 * QA Part B for the x402 devnet POC — server integration + bypass ordering.
 *
 * Requires a running dev server started with (at minimum):
 *   X402_ENABLED_AGENTS=<pocAgentId>
 *   X402_PAY_TO_DEVNET=<valid base58 devnet address>
 *   X402_FACILITATOR_URL=https://x402.org/facilitator   (dev; or CDP keys)
 *
 * Verifies (constraint #4 — tested, not assumed):
 *   1. /api/config advertises x402Agents
 *   2. Paywall: no-credit user + paymentMethod x402 + no payment -> 402 + PAYMENT-REQUIRED, no report
 *   3. Credit bypass: credit user runs the SAME x402 agent via credits -> 200, never 402
 *   4. Testing-mode bypass: if server has TESTING_MODE_FREE_RUNS on, x402 agent runs free -> 200
 *   5. Non-migrated agent: manual USDC path untouched (no PAYMENT-REQUIRED header)
 *   6. Failed payment: malformed X-PAYMENT -> 400, no report, no partial execution
 *
 * Run: node scripts/qa-x402-server.mjs
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
let passed = true;
const ok = (l) => console.log("  PASS:", l);
const fail = (l, d) => { console.log("  FAIL:", l, d || ""); passed = false; };

const cfg = await fetch(`${BASE}/api/config`).then((r) => r.json());
const x402Agents = cfg.x402Agents || [];
const testingOn = !!cfg.testingModeFreeRuns;
console.log(`config: x402Agents=[${x402Agents.join(", ")}] testingModeFreeRuns=${testingOn}\n`);
if (x402Agents.length) ok("config advertises x402Agents");
else { fail("config has no x402Agents — start server with X402_ENABLED_AGENTS"); process.exit(1); }

const pocAgent = x402Agents[0];

const services = await fetch(`${BASE}/api/services`).then((r) => r.json()).catch(() => ({}));
const allAgentIds = (services.services || []).map((s) => s.primaryAgentId).filter(Boolean);
const otherAgent = allAgentIds.find((a) => !x402Agents.includes(a));
console.log(`poc agent: ${pocAgent}; non-migrated agent for isolation test: ${otherAgent || "(none found)"}\n`);

const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const users = db.collection("users");
const reports = db.collection("reports");

function mkUser(credits) {
  const wallet = randomBytes(32).toString("base64url").slice(0, 44);
  return { id: uuidv4(), walletAddress: wallet, credits, creditsGranted: credits, plan: "FREE", createdAt: new Date() };
}
function authFor(u) {
  const token = jwt.sign({ userId: u.id, walletAddress: u.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
const runBody = (n) => JSON.stringify({ inputs: { query: `x402 qa run ${n} — what is a Solana rug pull?` }, paymentMethod: "x402" });

const noCredit = mkUser(0);
const withCredit = mkUser(2);
await users.insertMany([noCredit, withCredit]);

try {
  // 2 + 6 depend on testing mode being OFF (otherwise everything bypasses).
  if (!testingOn) {
    // 2: paywall challenge
    const r = await fetch(`${BASE}/api/agents/${pocAgent}/run`, { method: "POST", headers: authFor(noCredit), body: runBody("challenge") });
    const hasHeader = !!(r.headers.get("payment-required"));
    const reportCount = await reports.countDocuments({ userId: noCredit.id });
    if (r.status === 402 && hasHeader && reportCount === 0) ok("paywall: 402 + PAYMENT-REQUIRED, no report created");
    else fail("paywall challenge", `status=${r.status} header=${hasHeader} reports=${reportCount}`);

    // 6: malformed payment -> 400, no partial execution
    const bad = await fetch(`${BASE}/api/agents/${pocAgent}/run`, {
      method: "POST",
      headers: { ...authFor(noCredit), "X-PAYMENT": "!!!not-base64-json!!!" },
      body: runBody("bad"),
    });
    const badBody = await bad.json().catch(() => ({}));
    const reportsAfterBad = await reports.countDocuments({ userId: noCredit.id });
    if (bad.status === 400 && reportsAfterBad === 0) ok(`failed payment handled: ${bad.status} "${badBody.error}", no report`);
    else fail("malformed payment", `status=${bad.status} reports=${reportsAfterBad}`);
  } else {
    console.log("  (skip paywall/malformed checks — TESTING_MODE_FREE_RUNS is ON)");
  }

  // 3 or 4: bypass. In testing mode, x402 method itself bypasses to free run.
  if (testingOn) {
    const r = await fetch(`${BASE}/api/agents/${pocAgent}/run`, { method: "POST", headers: authFor(noCredit), body: runBody("testing-bypass") });
    if (r.status === 200) ok("testing-mode bypass: x402 agent ran free (200), never hit 402");
    else fail("testing-mode bypass", `status=${r.status}`);
  } else {
    const before = (await users.findOne({ id: withCredit.id })).credits;
    const r = await fetch(`${BASE}/api/agents/${pocAgent}/run`, {
      method: "POST", headers: authFor(withCredit),
      body: JSON.stringify({ inputs: { query: "credit bypass — what is a Solana rug pull?" }, paymentMethod: "credit" }),
    });
    const after = (await users.findOne({ id: withCredit.id })).credits;
    if (r.status === 200 && after === before - 1) ok(`credit bypass: x402 agent ran via credit (200), ${before}->${after}, never hit 402`);
    else { const b = await r.json().catch(() => ({})); fail("credit bypass", `status=${r.status} ${before}->${after} err=${b.error || ""}`); }
  }

  // 5: non-migrated agent isolation
  if (otherAgent) {
    const r = await fetch(`${BASE}/api/agents/${otherAgent}/run`, {
      method: "POST", headers: authFor(noCredit),
      body: JSON.stringify({ inputs: { query: "isolation test" }, paymentMethod: "usdc", paymentSignature: "invalid-sig" }),
    });
    const hasHeader = !!(r.headers.get("payment-required"));
    if (!hasHeader) ok(`non-migrated agent unaffected: no PAYMENT-REQUIRED header (status ${r.status}, manual path)`);
    else fail("non-migrated agent leaked into x402 path", `PAYMENT-REQUIRED present, status ${r.status}`);
  } else {
    console.log("  (skip isolation check — no non-x402 agent found)");
  }
} finally {
  await users.deleteMany({ id: { $in: [noCredit.id, withCredit.id] } });
  await reports.deleteMany({ userId: { $in: [noCredit.id, withCredit.id] } });
  await client.close();
}

console.log("\n=== SUMMARY ===");
console.log(passed ? "All x402 server/bypass checks passed." : "Some checks failed.");
process.exit(passed ? 0 : 1);
