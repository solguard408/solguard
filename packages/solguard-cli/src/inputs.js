/** Input schemas keyed by primary agent id — mirrors lib/solguard/formSchemas.js (no Next.js imports). */
export const AGENT_INPUTS = {
  "solana-token-verification": [
    { key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  ],
  "contract-security": [
    { key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  ],
  "wallet-verification": [
    { key: "walletAddress", label: "Wallet Address", placeholder: "Solana wallet pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" },
  ],
  "website-security": [
    { key: "url", label: "Website URL", placeholder: "https://example.com", example: "https://solana.com" },
  ],
  "ai-consultant": [
    { key: "query", label: "Your Question", placeholder: "e.g. How do honeypot tokens lock liquidity?", example: "What is the most common Solana token rug-pull pattern?", multiline: true },
  ],
  "openclaw-ai-agent-verification": [
    { key: "config", label: "Agent Config (JSON)", placeholder: '{"name":"support-agent","gateway":{"auth":"none"}}', example: '{"name":"support-agent","gateway":{"auth":"none"}}', multiline: true },
  ],
  "private-data-verification": [
    { key: "cpdv_data", label: "Data to commit", placeholder: "Paste sensitive text or JSON…", example: "customer-record-8842:status=verified", multiline: true },
  ],
  "quantum-cryptography-verification": [
    { key: "cqcv_data", label: "Data to encrypt", placeholder: "Paste text to encrypt…", example: "confidential-api-key-rotation-schedule", multiline: true },
  ],
};

export function getInputsForAgent(agentId) {
  return AGENT_INPUTS[agentId] || [];
}

export const CONSULTANT_AGENT_ID = "ai-consultant";
export const CONSULTANT_SERVICE_ID = "cyber-consultant";
