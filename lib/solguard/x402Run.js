/**
 * Shared x402 paid-run helper for ServiceDetailPage and AgentPage.
 * Devnet-only; delegates to x402ClientDevnet when the agent is flagged.
 */
export function shouldUseX402({ agentId, x402Agents, testingMode, credits, hasSubscription }) {
  const needsPaidRun = !testingMode && (credits || 0) <= 0 && !hasSubscription;
  return needsPaidRun && (x402Agents || []).includes(agentId);
}

export async function runAgentViaX402({ agentId, inputs, walletProvider, amountUsdc }) {
  const { runViaX402 } = await import("@/lib/solguard/x402ClientDevnet");
  return runViaX402({ agentId, inputs, walletProvider, amountUsdc });
}
