import { listServices } from "./services";

/** Per-service Try-it form fields (Cybercentry labels). */
export const SERVICE_FORM_INPUTS = {
  "cyber-consultant": [
    {
      key: "query",
      type: "text",
      label: "Your Question",
      placeholder: "e.g. How do honeypot tokens lock liquidity?",
      example: "What is the most common Solana token rug-pull pattern in 2025?",
      multiline: true,
    },
  ],
  "dapp-frontend-verification": [
    {
      key: "url",
      type: "url",
      label: "Endpoint URL",
      placeholder: "https://example.com",
      example: "https://solana.com",
    },
  ],
};

/** Default input schemas by agent id (no executor imports — safe for client bundles). */
const AGENT_DEFAULT_INPUTS = {
  "solana-token-verification": [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
  "contract-security": [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
  "wallet-verification": [{ key: "walletAddress", label: "Wallet Address", placeholder: "Solana wallet pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }],
  "website-security": [{ key: "url", type: "url", label: "Website URL", placeholder: "https://example.com", example: "https://solana.com" }],
  "ai-consultant": [{ key: "query", type: "text", label: "Your Question", placeholder: "e.g. How do honeypot tokens lock liquidity?", example: "What is the most common Solana token rug-pull pattern in 2025?", multiline: true }],
  "openclaw-ai-agent-verification": [{ key: "config", type: "json", label: "Agent Config (JSON)", placeholder: '{"name":"support-agent","gateway":{"auth":"none"}}', example: '{"name":"support-agent","gateway":{"auth":"none"}}' }],
  "private-data-verification": [{ key: "cpdv_data", type: "text", label: "Data to commit", placeholder: "Paste sensitive text or JSON payload…", example: "customer-record-8842:status=verified", multiline: true }],
  "quantum-cryptography-verification": [{ key: "cqcv_data", type: "text", label: "Data to encrypt", placeholder: "Paste text to encrypt…", example: "confidential-api-key-rotation-schedule-2026", multiline: true }],
};

export function getServiceFormInputs(serviceId, agentInputs) {
  const override = SERVICE_FORM_INPUTS[serviceId];
  if (override) return override.map((f) => ({ ...f }));
  return (agentInputs || AGENT_DEFAULT_INPUTS[serviceId] || []).map((f) => ({ ...f }));
}

/** Same Try-it schema as service detail pages — keyed by primary agent id. */
export function getServiceFormInputsForAgent(agentId) {
  const service = listServices().find((s) => s.primaryAgentId === agentId);
  if (service) return getServiceFormInputs(service.id, AGENT_DEFAULT_INPUTS[agentId]);
  return (AGENT_DEFAULT_INPUTS[agentId] || []).map((f) => ({ ...f }));
}

/** Schema for a marketplace service page (preferred on client — keyed by URL serviceId). */
export function getServiceFormInputsForService(serviceId) {
  const service = listServices().find((s) => s.id === serviceId);
  if (!service) return [];
  return getServiceFormInputs(serviceId, AGENT_DEFAULT_INPUTS[service.primaryAgentId]);
}
