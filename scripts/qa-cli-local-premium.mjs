import { runAgentLocalPremium, canRunLocalPremium } from "../packages/solguard-cli/src/premium.js";

const config = JSON.stringify({
  name: "test-agent",
  gateway: { auth: "none" },
  tools: ["shell", "http"],
});

const r = await runAgentLocalPremium("openclaw-ai-agent-verification", { config });
console.log("openclaw:", r.riskLevel, r.verdict?.slice(0, 80));

console.log("supported:", Object.keys({
  consultant: canRunLocalPremium("ai-consultant"),
  token: canRunLocalPremium("solana-token-verification"),
  wallet: canRunLocalPremium("wallet-verification"),
  vault: canRunLocalPremium("private-data-verification"),
}).filter((k) => true));
