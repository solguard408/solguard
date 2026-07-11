/** Shared X share branding — change domain/handle here only. */
export const SHARE_CONFIG = {
  domain: "solguard.space",
  handle: "@SolGuard_",
  intentBase: "https://twitter.com/intent/tweet",
};

const MAX_TWEET_CHARS = 250;

/** agentId → generic scan target (never a specific address, name, or domain). */
const TARGET_TYPE_BY_AGENT = {
  "solana-token-verification": "a Solana token",
  "token-audit": "a Solana token",
  "contract-security": "a Solana token",
  "bundle-detection": "a Solana token",
  "holder-distribution": "a Solana token",
  "liquidity-verification": "a liquidity pool",
  "liquidity-lock-analysis": "a liquidity pool",
  "metadata-verification": "a Solana token",
  "rug-probability": "a Solana token",
  "risk-score": "a Solana token",
  "market-manipulation": "trading activity",
  "volume-authenticity": "trading activity",
  "wallet-verification": "a wallet",
  "wallet-audit": "a wallet",
  "developer-wallet-analysis": "a wallet",
  "social-verification": "social channels",
  "website-security": "a website",
  "ai-consultant": "a security target",
  "openclaw-ai-agent-verification": "an AI agent",
  "private-data-verification": "sensitive data",
  "quantum-cryptography-verification": "encrypted data",
};

function parseRiskDelta(impact) {
  if (!impact || typeof impact !== "string") return 0;
  const m = impact.match(/\+(\d+)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

/** Count findings by impact weight — never reads labels, values, or explanations. */
export function countSeverityFindings(keyFindings = []) {
  let critical = 0;
  let medium = 0;
  for (const f of keyFindings) {
    const n = parseRiskDelta(f?.impact);
    if (n >= 30) critical += 1;
    else if (n >= 10) medium += 1;
  }
  return { critical, medium };
}

export function resolveTargetType(report) {
  const agentId = report?.agentId || report?.result?.agentId;
  return TARGET_TYPE_BY_AGENT[agentId] || "a security target";
}

function pluralIssue(n) {
  return n === 1 ? "issue" : "issues";
}

function buildFindingsLine(targetType, critical, medium) {
  if (critical > 0 && medium > 0) {
    return `🛡️ SolGuard just scanned ${targetType} — found ${critical} critical & ${medium} medium risk ${pluralIssue(critical + medium)} in seconds.`;
  }
  if (critical > 0) {
    return `🛡️ SolGuard just scanned ${targetType} — found ${critical} critical risk ${pluralIssue(critical)} in seconds.`;
  }
  if (medium > 0) {
    return `🛡️ SolGuard just scanned ${targetType} — found ${medium} medium risk ${pluralIssue(medium)} in seconds.`;
  }
  return `🛡️ SolGuard just scanned ${targetType} — no critical or medium risk flags detected.`;
}

function buildFooter() {
  return [
    "",
    "AI-powered security analysis. Real-time reports. Zero setup.",
    "",
    `Try it → ${SHARE_CONFIG.domain}`,
    `via ${SHARE_CONFIG.handle}`,
  ].join("\n");
}

function truncateTweet(text, maxLen = MAX_TWEET_CHARS) {
  if (text.length <= maxLen) return text;
  const footer = buildFooter();
  const footerLen = footer.length;
  const budget = maxLen - footerLen - 1;
  const headline = text.slice(0, text.indexOf("\n\n"));
  const trimmed = headline.slice(0, Math.max(40, budget - 1)).trimEnd() + "…";
  return `${trimmed}\n${footer}`;
}

/**
 * Build safe share text from report envelope — aggregate counts only, no target specifics.
 * @param {object} report — full report doc ({ agentId, result }) or result object
 */
export function buildShareTweetText(report) {
  const r = report?.result || report;
  const targetType = resolveTargetType(report);
  const { critical, medium } = countSeverityFindings(r?.keyFindings || []);

  const headline = buildFindingsLine(targetType, critical, medium);
  const text = `${headline}\n${buildFooter()}`;
  return truncateTweet(text);
}

export function buildShareIntentUrl(report) {
  const text = buildShareTweetText(report);
  return `${SHARE_CONFIG.intentBase}?text=${encodeURIComponent(text)}`;
}

/** Opens X compose in a new tab — client-only. */
export function openShareToX(report) {
  if (typeof window === "undefined") return;
  const url = buildShareIntentUrl(report);
  window.open(url, "_blank", "noopener,noreferrer");
}
