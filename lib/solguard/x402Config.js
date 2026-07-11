/**
 * x402 feature configuration — Phase 2.
 *
 * Toggle agents independently via X402_ENABLED_AGENTS (comma-separated agent ids).
 * Use `all` or `*` to enable every marketplace primary agent on devnet.
 *
 * Examples:
 *   X402_ENABLED_AGENTS=ai-consultant
 *   X402_ENABLED_AGENTS=ai-consultant,wallet-verification
 *   X402_ENABLED_AGENTS=all
 *
 * Devnet-only in Phase 2 — no mainnet path here.
 */
import { SERVICES } from "./services";

/** Primary agent id for each marketplace service card (8 services). */
export const PRIMARY_SERVICE_AGENT_IDS = [
  ...new Set(SERVICES.map((s) => s.primaryAgentId).filter(Boolean)),
];

export const X402_NETWORK = "devnet";

export function x402EnabledAgents() {
  const raw = (process.env.X402_ENABLED_AGENTS || "").trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  if (lower === "all" || lower === "*") return [...PRIMARY_SERVICE_AGENT_IDS];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isX402Agent(agentId) {
  return x402EnabledAgents().includes(agentId);
}

export function isX402Enabled() {
  return x402EnabledAgents().length > 0;
}
