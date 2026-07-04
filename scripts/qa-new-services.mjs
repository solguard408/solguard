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
const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const tests = [
  {
    id: "openclaw-ai-agent-verification",
    inputs: { config: JSON.stringify({ name: "support-agent", gateway: { auth: "none" }, tools: ["http"] }) },
  },
  { id: "private-data-verification", inputs: { cpdv_data: "secret-customer-record-8842" } },
  { id: "quantum-cryptography-verification", inputs: { cqcv_data: "my-api-key-rotation-plan" } },
];

for (const t of tests) {
  const r = await fetch(`http://localhost:3000/api/agents/${t.id}/run`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ inputs: t.inputs, paymentMethod: "testing" }),
  });
  const j = await r.json();
  const res = j.result || j;
  console.log(`\n=== ${t.id} ${r.status} ===`);
  console.log("verdict:", res.verdict?.slice(0, 120));
  console.log("risk:", res.riskScore, res.riskLevel);
  console.log("findings:", res.keyFindings?.length);
  if (res.rawEvidence?.proof_id) {
    const vr = await fetch(`http://localhost:3000/api/verify/proof/${res.rawEvidence.proof_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: t.inputs.cpdv_data }),
    });
    const vj = await vr.json();
    console.log("verify match:", vj.matched);
  }
  if (res.rawEvidence?.record_id) {
    const dr = await fetch(`http://localhost:3000/api/vault/${res.rawEvidence.record_id}`, { headers: h });
    const dj = await dr.json();
    console.log("decrypt ok:", dj.plaintext === t.inputs.cqcv_data);
  }
}

await client.close();
