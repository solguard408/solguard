import { readFileSync } from "fs";
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
const db = client.db(env.DB_NAME || "solguard");
const users = db.collection("users");

const withCredits = await users.find({ credits: { $gt: 0 } }).project({ walletAddress: 1, credits: 1 }).toArray();
console.log("Users with credits > 0 before cleanup:", withCredits.length);
for (const u of withCredits) {
  console.log(`  ${u.walletAddress?.slice(0, 8)}… credits=${u.credits}`);
}

const result = await users.updateMany({}, { $set: { credits: 0 } });
console.log("\nUpdated users:", result.modifiedCount);

const cfg = await fetch("http://localhost:3000/api/config").then((r) => r.json());
console.log("\n/api/config:", cfg);

// Agent run without payment should 402
import jwt from "jsonwebtoken";
const user = await users.findOne({});
const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });
const run = await fetch("http://localhost:3000/api/agents/contract-security/run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    inputs: { tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    paymentMethod: "usdc",
  }),
});
const runBody = await run.json();
console.log("\nAgent run without payment:", run.status, runBody.error || "unexpected success");

// Rate limit still works
let limited = 0;
for (let i = 0; i < 25; i++) {
  const r = await fetch("http://localhost:3000/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: user.walletAddress }),
  });
  if (r.status === 429) limited++;
}
console.log("Rate limit 429 count:", limited);

await client.close();
