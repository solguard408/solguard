// Marketplace service layer — 5 consolidated cards for Explorer UI.
// Backend executors remain in agents.js; services map to primaryAgentId + stats rollup.

export const SERVICES = [
  {
    id: "solana-token-verification",
    name: "Solana Token Verification",
    category: "Token",
    icon: "Coins",
    actionLabel: "Check token ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "solana-token-verification",
    rollupAgentIds: [
      "solana-token-verification",
      "token-audit",
      "bundle-detection",
      "holder-distribution",
      "liquidity-verification",
      "liquidity-lock-analysis",
    ],
    description:
      "Secures Solana SPL token structures with AI-powered anomaly analysis. Consolidates multi-layered token due diligence to scan for rug pulls, mint authority risks, bundle anomalies, and holder distribution concentrations in a single report view.",
  },
  {
    id: "smart-contract-audit",
    name: "Smart Contract Security Audit",
    category: "Contract",
    icon: "Lock",
    actionLabel: "Audit contract ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "contract-security",
    rollupAgentIds: ["contract-security"],
    description:
      "Fast, automated vulnerability scanning of Solana Rust and Anchor smart contract code architectures with rigorous risk-level grading and exploit-vector matching.",
  },
  {
    id: "wallet-verification",
    name: "Wallet Verification",
    category: "Wallet",
    icon: "Wallet",
    actionLabel: "Verify wallet ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "wallet-verification",
    rollupAgentIds: ["wallet-verification", "wallet-audit", "developer-wallet-analysis"],
    description:
      "Real-time blockchain behavior profiling across Solana wallet addresses, identifying transaction history anomalies, account age metadata, and historic exploit deployer linkage.",
  },
  {
    id: "dapp-frontend-verification",
    name: "Web3 dApp Frontend Verification",
    category: "Web",
    icon: "Shield",
    actionLabel: "Scan dApp ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "website-security",
    rollupAgentIds: ["website-security"],
    description:
      "Secures website assets, dApp frontend domains, and deployment entrypoints using OWASP-aligned deep security vulnerability scanning to prevent UI-hijacking exploits.",
  },
  {
    id: "cyber-consultant",
    name: "Cyber Security Consultant",
    category: "Advisory",
    icon: "MessageSquare",
    actionLabel: "Ask consultant ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "ai-consultant",
    rollupAgentIds: ["ai-consultant"],
    description:
      "Instant advisory assistance and interactive threat intelligence powered by your secure advisory model. Formulates automated remediation paths, compliance rules, and best-practice blueprints.",
  },
  {
    id: "openclaw-ai-agent-verification",
    name: "OpenClaw AI Agent Verification",
    category: "AI Agent",
    icon: "Bot",
    actionLabel: "Audit agent config ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "openclaw-ai-agent-verification",
    rollupAgentIds: ["openclaw-ai-agent-verification"],
    description:
      "Automated rule-based configuration audit for OpenClaw-style AI agent JSON — checks gateway authentication, tool permissions, injection surfaces, and session handling (not LLM inference).",
  },
  {
    id: "private-data-verification",
    name: "Private Data Integrity Proof",
    category: "Privacy",
    icon: "Fingerprint",
    actionLabel: "Create proof ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "private-data-verification",
    rollupAgentIds: ["private-data-verification"],
    description:
      "Generate a salted SHA-256 cryptographic commitment to your data with a shareable verification URL — raw payload is never stored. Honestly labeled as integrity proof, not zero-knowledge proof.",
  },
  {
    id: "quantum-cryptography-verification",
    name: "Encrypted Data Vault",
    category: "Crypto",
    icon: "KeyRound",
    actionLabel: "Encrypt data ↗",
    price: 0.10,
    proTeaser: "$0.06 with Pro",
    primaryAgentId: "quantum-cryptography-verification",
    rollupAgentIds: ["quantum-cryptography-verification"],
    description:
      "AES-256-GCM encrypted storage keyed to your wallet with owner-only retrieval — high-grade symmetric encryption, explicitly not post-quantum or quantum-resistant.",
  },
];

export function listServices() {
  return SERVICES;
}

export function getService(id) {
  return SERVICES.find((s) => s.id === id) || null;
}

export function getAllRollupAgentIds(service) {
  return service?.rollupAgentIds || [service?.primaryAgentId].filter(Boolean);
}
