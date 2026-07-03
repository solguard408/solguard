import { MongoClient } from "mongodb";
import { readFileSync } from "fs";
import { verifyUsdcPayment } from "../lib/solguard/payment.js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

process.env.MONGO_URL = env.MONGO_URL;
process.env.DB_NAME = env.DB_NAME;
process.env.HELIUS_API_KEY = env.HELIUS_API_KEY;

const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const existing = await db.collection("payments").findOne({});
if (!existing) {
  console.log(JSON.stringify({ skipped: true, reason: "No payments in DB to test dedupe" }, null, 2));
  await client.close();
  process.exit(0);
}
const second = await verifyUsdcPayment({
  signature: existing.signature,
  amountUsdc: 0.1,
  payerAddress: existing.payer,
});
console.log(
  JSON.stringify(
    {
      testedSignature: existing.signature.slice(0, 12) + "...",
      secondAttempt: second,
      pass: second.ok === false && /already used/i.test(second.error || ""),
    },
    null,
    2
  )
);
await client.close();
