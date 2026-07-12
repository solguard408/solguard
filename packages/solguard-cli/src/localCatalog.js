/**
 * Built-in catalog for premium local runs — no SolGuard API required.
 * Kept in sync with lib/solguard/services.js + formSchemas.js for the 6 local agents.
 */

export const LOCAL_SERVICES = [
  {
    id: "cyber-consultant",
    name: "Cyber Security Consultant",
    category: "Advisory",
    primaryAgentId: "ai-consultant",
    inputs: [
      {
        key: "query",
        type: "text",
        label: "Your Question",
        placeholder: "e.g. How do honeypot tokens lock liquidity?",
        example: "What is the most common Solana token rug-pull pattern in 2025?",
        multiline: true,
      },
    ],
  },
  {
    id: "solana-token-verification",
    name: "Solana Token Verification",
    category: "Token",
    primaryAgentId: "solana-token-verification",
    inputs: [
      {
        key: "tokenAddress",
        label: "Token Mint Address",
        placeholder: "e.g. DezXAZ8z7Pnr...",
        example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      },
    ],
  },
  {
    id: "smart-contract-audit",
    name: "Smart Contract Security Audit",
    category: "Contract",
    primaryAgentId: "contract-security",
    inputs: [
      {
        key: "tokenAddress",
        label: "Token Mint Address",
        placeholder: "e.g. DezXAZ8z7Pnr...",
        example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      },
    ],
  },
  {
    id: "wallet-verification",
    name: "Wallet Verification",
    category: "Wallet",
    primaryAgentId: "wallet-verification",
    inputs: [
      {
        key: "walletAddress",
        label: "Wallet Address",
        placeholder: "Solana wallet pubkey",
        example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      },
    ],
  },
  {
    id: "dapp-frontend-verification",
    name: "Web3 dApp Frontend Verification",
    category: "Web",
    primaryAgentId: "website-security",
    inputs: [
      {
        key: "url",
        type: "url",
        label: "Website URL",
        placeholder: "https://example.com",
        example: "https://solana.com",
      },
    ],
  },
  {
    id: "openclaw-ai-agent-verification",
    name: "OpenClaw AI Agent Verification",
    category: "AI Agent",
    primaryAgentId: "openclaw-ai-agent-verification",
    inputs: [
      {
        key: "config",
        type: "json",
        label: "Agent Config (JSON)",
        placeholder: '{"name":"support-agent","gateway":{"auth":"none"}}',
        example: '{"name":"support-agent","gateway":{"auth":"none"}}',
      },
    ],
  },
];

export function listLocalServices() {
  return LOCAL_SERVICES;
}

export function getLocalService(serviceId) {
  return LOCAL_SERVICES.find((s) => s.id === serviceId) || null;
}
