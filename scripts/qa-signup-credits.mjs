/**
 * Verify signup free credits (TESTING_MODE_FREE_RUNS must be false).
 * Run: node scripts/qa-signup-credits.mjs
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
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const BASE = "http://localhost:3000";
const SIGNUP_FREE_CREDITS = 2;

const cfg = await fetch(`${BASE}/api/config`).then((r) => r.json());
if (cfg.testingModeFreeRuns) {
  console.error("FAIL: TESTING_MODE_FREE_RUNS is true — set false and restart dev server");
  process.exit(1);
}
console.log("OK: testingModeFreeRuns=false\n");

const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const users = db.collection("users");

const existing = await users.findOne({ credits: { $exists: true } }, { sort: { createdAt: 1 } });
const existingCreditsBefore = existing?.credits ?? null;
console.log("Existing user sample:", existing?.walletAddress?.slice(0, 8) + "…", "credits before:", existingCreditsBefore);

const testWallet = randomBytes(32).toString("base64url").slice(0, 44);
const testUser = {
  id: uuidv4(),
  walletAddress: testWallet,
  credits: SIGNUP_FREE_CREDITS,
  creditsGranted: SIGNUP_FREE_CREDITS,
  plan: "FREE",
  createdAt: new Date(),
};
await users.insertOne(testUser);
console.log("\nCreated test user with", SIGNUP_FREE_CREDITS, "credits");

const token = jwt.sign({ userId: testUser.id, walletAddress: testWallet }, env.JWT_SECRET, { expiresIn: "1h" });
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function me() {
  const r = await fetch(`${BASE}/api/me`, { headers: auth });
  return r.json();
}

async function creditRun(n) {
  const r = await fetch(`${BASE}/api/agents/ai-consultant/run`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      inputs: { query: `Signup credit test run ${n} — what is a Solana rug pull?` },
      paymentMethod: "credit",
    }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

let passed = true;
function ok(label) { console.log("  PASS:", label); }
function fail(label, detail) { console.log("  FAIL:", label, detail || ""); passed = false; }

const m0 = await me();
if (m0.credits === SIGNUP_FREE_CREDITS) ok(`Initial balance = ${SIGNUP_FREE_CREDITS}`);
else fail(`Initial balance = ${SIGNUP_FREE_CREDITS}`, `got ${m0.credits}`);

for (let i = 1; i <= SIGNUP_FREE_CREDITS; i++) {
  const run = await creditRun(i);
  const bal = (await me()).credits;
  const expected = SIGNUP_FREE_CREDITS - i;
  if (run.status === 200 && bal === expected) ok(`Run ${i}: status 200, credits ${bal}`);
  else fail(`Run ${i}`, `status ${run.status}, credits ${bal}, err=${run.body?.error || ""}`);
}

const run3 = await creditRun(3);
const bal3 = (await me()).credits;
if (run3.status === 402 && bal3 === 0) ok("Run 3 blocked with 402, credits still 0");
else fail("Run 3 should 402", `status ${run3.status}, credits ${bal3}`);

const existingAfter = existing ? await users.findOne({ id: existing.id }) : null;
if (!existing || existingAfter?.credits === existingCreditsBefore) {
  ok("Existing user credits unchanged");
} else {
  fail("Existing user credits changed", `${existingCreditsBefore} -> ${existingAfter?.credits}`);
}

await users.deleteOne({ id: testUser.id });
await client.close();

console.log("\n=== SUMMARY ===");
console.log(passed ? "All signup credit checks passed." : "Some checks failed.");
process.exit(passed ? 0 : 1);
