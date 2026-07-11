import { getService } from "./services";
import { getAgent } from "./agents";
import { getServiceFormInputs } from "./formSchemas";
import { isX402Agent } from "./x402Config";

/** API response field docs for service detail pages. */
export const STANDARD_REPORT_RETURNS = [
  { field: "reportId", type: "string", description: "Unique report identifier for this run." },
  { field: "agentId", type: "string", description: "Agent that produced the report." },
  { field: "riskScore", type: "number", description: "Composite risk score from 0 (safest) to 100 (highest risk)." },
  { field: "riskLevel", type: "string", description: "Severity bucket: LOW, MEDIUM, HIGH, or CRITICAL." },
  { field: "verdict", type: "string", description: "One-sentence plain-English bottom line." },
  { field: "keyFindings", type: "object[]", description: "Itemized checks with label, value, impact, and explanation." },
  { field: "recommendations", type: "string[]", description: "Actionable next steps." },
  { field: "confidence", type: "string", description: "Data completeness / reliability note." },
  { field: "rawEvidence", type: "object", description: "Technical evidence payload for advanced users." },
];

const EXTRA_RETURNS = {
  "private-data-verification": [
    { field: "proof_id", type: "string", description: "Public proof identifier for verification." },
    { field: "proof_url", type: "string", description: "Shareable path to verify data integrity (/verify/{proof_id})." },
    { field: "commitment", type: "string", description: "SHA-256 salted commitment (raw data not stored)." },
    { field: "algorithm", type: "string", description: "Commitment scheme label (sha256-salted-commitment)." },
  ],
  "quantum-cryptography-verification": [
    { field: "record_id", type: "string", description: "Encrypted record identifier (owner-only retrieval)." },
    { field: "decrypt_url", type: "string", description: "Authenticated API path to decrypt (GET /api/vault/{record_id})." },
    { field: "algorithm", type: "string", description: "aes-256-gcm (symmetric — not post-quantum)." },
    { field: "keyLabel", type: "string", description: "Human-readable crypto honesty label." },
  ],
};

export function getServiceDetail(serviceId) {
  const service = getService(serviceId);
  if (!service) return null;
  const agent = getAgent(service.primaryAgentId);
  if (!agent) return null;

  const returns = [
    ...STANDARD_REPORT_RETURNS,
    ...(EXTRA_RETURNS[service.primaryAgentId] || []),
  ];

  return {
    ...service,
    agent: {
      id: agent.id,
      name: agent.name,
      category: agent.category,
      icon: agent.icon,
      price: agent.price,
      estimatedTime: agent.estimatedTime,
      description: agent.description,
      longDescription: agent.longDescription,
      features: agent.features || [],
      inputs: getServiceFormInputs(serviceId, agent.inputs),
      supportedChains: agent.supportedChains,
    },
    canonicalPath: `/api/agents/${agent.id}/run`,
    returns,
    settlement: isX402Agent(agent.id) ? "x402 devnet · USDC" : "USDC on Solana mainnet",
    settlementNote: isX402Agent(agent.id)
      ? "x402 devnet micropayments · mainnet x402 coming soon · USDC mainnet also accepted via credits or direct transfer"
      : "USDC on Solana mainnet · credits or subscription",
    sla: agent.estimatedTime || "~5s",
    network: "Solana",
  };
}

export function buildCurlExample(serviceId, origin = "https://www.solguard.space") {
  const detail = getServiceDetail(serviceId);
  if (!detail) return "";
  const agent = detail.agent;
  const sampleInputs = {};
  for (const inp of agent.inputs || []) {
    sampleInputs[inp.key] = inp.example || inp.placeholder || "";
  }
  const body = JSON.stringify({ inputs: sampleInputs, paymentMethod: "usdc", paymentSignature: "<tx_sig>" }, null, 2);
  return `curl -X POST "${origin}${detail.canonicalPath}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <wallet_jwt>" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
}
