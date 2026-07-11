/**
 * Local premium agent runners — CLI BYOK / local execution without SolGuard backend.
 * MongoDB-dependent agents (privacy vault, encrypted vault) are excluded.
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { runTokenScan } from "../scanEngine.js";
import { generateRiskSummary, isInvalidAiVerdict } from "../aiSummary.js";
import {
  buildReport,
  buildOnChainVerdict,
  finding,
  formatSol,
  holderShareLabel,
} from "../reportBuilder.js";
import { analyzeOpenClawConfig } from "../openclawAudit.js";
import { EXPLOITS } from "../exploits.js";
import { runConsultant } from "./consultant.js";

const TOKEN_SOURCES = ["Helius RPC", "DexScreener", "Solana Mainnet"];
const WALLET_SOURCES = ["Helius RPC", "Solana Mainnet"];
const WEB_SOURCES = ["HTTP Security Scan"];
const CONFIG_SOURCES = ["Static JSON rule engine"];

/** Agent IDs that support premium local mode in the CLI. */
export const LOCAL_PREMIUM_AGENTS = {
  "ai-consultant": { usesByok: true },
  "solana-token-verification": { usesByok: true },
  "contract-security": { usesByok: false },
  "wallet-verification": { usesByok: false },
  "website-security": { usesByok: false },
  "openclaw-ai-agent-verification": { usesByok: false },
};

const HELIUS_AGENTS = new Set([
  "solana-token-verification",
  "contract-security",
  "wallet-verification",
]);

export function canRunLocalPremium(agentId) {
  return agentId in LOCAL_PREMIUM_AGENTS;
}

export function agentUsesByokLlm(agentId) {
  return LOCAL_PREMIUM_AGENTS[agentId]?.usesByok === true;
}

export function localPremiumRequiresHelius(agentId) {
  return HELIUS_AGENTS.has(agentId);
}

function getConnection() {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    throw new Error(
      "HELIUS_API_KEY is required for local on-chain scans. Set it in your environment before using premium local mode."
    );
  }
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, "confirmed");
}

async function getWalletProfile(walletAddress) {
  const conn = getConnection();
  const pk = new PublicKey(walletAddress);
  const lamports = await conn.getBalance(pk);
  const balanceSol = lamports / LAMPORTS_PER_SOL;

  let before = undefined;
  let oldestSig = null;
  let newestSig = null;
  let txCountSampled = 0;
  let historyComplete = true;
  const MAX_PAGES = 15;
  const PAGE = 1000;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await conn.getSignaturesForAddress(pk, { limit: PAGE, before });
    if (!batch.length) break;
    txCountSampled += batch.length;
    if (!newestSig) newestSig = batch[0];
    oldestSig = batch[batch.length - 1];
    if (batch.length < PAGE) break;
    before = batch[batch.length - 1].signature;
    if (page === MAX_PAGES - 1) historyComplete = false;
  }

  const firstTxAt = oldestSig?.blockTime ?? null;
  const lastTxAt = newestSig?.blockTime ?? null;
  const ageDays = firstTxAt != null ? Math.floor((Date.now() / 1000 - firstTxAt) / 86400) : null;
  const botFlag = txCountSampled > 30 && ageDays != null && ageDays < 1;

  return {
    lamports,
    balanceSol,
    balanceLabel: formatSol(lamports),
    ageDays,
    txCountSampled,
    historyComplete,
    firstTxAt,
    lastTxAt,
    botFlag,
  };
}

function walletRecommendations(profile) {
  const recs = [];
  if (profile.ageDays != null && profile.ageDays < 7) {
    recs.push("Verify the wallet owner's identity through an independent channel before sending significant funds.");
  }
  if (profile.txCountSampled < 5) {
    recs.push("Request additional on-chain activity proof — this wallet has very few recorded transactions.");
  }
  if (profile.botFlag) {
    recs.push("Review whether automated bots control this wallet before relying on its trading behavior.");
  }
  if (profile.balanceSol >= 1_000_000) {
    recs.push("Treat as a high-value treasury or exchange hot wallet — confirm you are interacting with the intended counterparty.");
  } else if (profile.balanceSol < 0.01) {
    recs.push("Low SOL balance may indicate a disposable wallet — avoid high-value transfers until history improves.");
  }
  if (!recs.length) recs.push("No urgent actions required — continue monitoring for unusual outbound transfers.");
  return recs.slice(0, 4);
}

function walletConfidence(profile) {
  if (profile.historyComplete) {
    return `High — full on-chain history scanned (${profile.txCountSampled.toLocaleString()} transactions)`;
  }
  return `Medium — sampled ${profile.txCountSampled.toLocaleString()} transactions; wallet may predate oldest scanned activity`;
}

function deriveTokenRecs(scan) {
  const recs = [];
  if (scan.authorityCheck.freezeAuthority === "ACTIVE") recs.push("Avoid trading until the freeze authority is permanently revoked.");
  if (scan.authorityCheck.mintAuthority === "ACTIVE") recs.push("Monitor supply on explorers — the deployer can mint unlimited new tokens.");
  if (scan.bundleDetection.detected) recs.push("Watch for coordinated sell pressure from the clustered launch wallets.");
  if (!scan.liquidityLock.poolFound) recs.push("Do not buy until a verified DEX pool with adequate liquidity exists.");
  if (scan.liquidityLock.poolFound && scan.liquidityLock.liquidityUsd != null && scan.liquidityLock.liquidityUsd < 10000) {
    recs.push("Use small position sizes — shallow liquidity makes exits costly.");
  }
  if (!recs.length) recs.push("No critical flags — continue routine monitoring before increasing exposure.");
  return recs.slice(0, 4);
}

function tokenConfidence(scan) {
  const base = "High — mint account and liquidity data pulled from live mainnet RPC";
  if (scan.bundleDetection?.holderDataAvailable === false) {
    return `Medium — holder concentration unverified (${scan.bundleDetection.holderDataError || "RPC limitation"})`;
  }
  return `${base}; top-20 holder balances via getTokenLargestAccounts`;
}

function pickTokenVerdict(ai, scan) {
  if (ai.aiAvailable && ai.verdict && !isInvalidAiVerdict(ai.verdict)) {
    return { verdict: ai.verdict, aiUsed: true, aiReason: ai.reason };
  }
  const reason = ai.aiAvailable && ai.verdict ? "invalid_verdict_shape" : ai.reason;
  return { verdict: buildOnChainVerdict(scan), aiUsed: false, aiReason: reason };
}

function tokenFindingsFromScan(scan) {
  const a = scan.authorityCheck;
  const b = scan.bundleDetection;
  const l = scan.liquidityLock;
  return [
    finding(
      "Mint Authority",
      a.mintAuthority === "ACTIVE" ? "Active" : "Revoked",
      a.mintAuthority === "ACTIVE" ? "+20 risk" : "-20 risk",
      a.mintAuthority === "ACTIVE"
        ? "The deployer can create unlimited new tokens, diluting existing holders at any time."
        : "No one can mint new supply, which removes a common rug-pull vector."
    ),
    finding(
      "Freeze Authority",
      a.freezeAuthority === "ACTIVE" ? "Active" : "Revoked",
      a.freezeAuthority === "ACTIVE" ? "+30 risk" : "neutral",
      a.freezeAuthority === "ACTIVE"
        ? "The deployer can freeze any holder's tokens, locking them out of selling."
        : "Holder wallets cannot be frozen by the token creator."
    ),
    finding(
      "Top Holder Concentration",
      holderShareLabel(b, false) + (b.holderDataAvailable ? " of supply" : ""),
      !b.holderDataAvailable ? "unknown" : b.topHolderPercent > 20 ? "+10 risk" : "neutral",
      !b.holderDataAvailable
        ? "Concentration could not be measured — do not assume a safe distribution."
        : b.topHolderPercent > 20
          ? "A single wallet controls a large share, increasing dump risk."
          : "No single wallet dominates supply, which supports healthier distribution."
    ),
    finding(
      "Top 10 Holder Concentration",
      holderShareLabel(b, true) + (b.holderDataAvailable ? " of supply" : ""),
      !b.holderDataAvailable ? "unknown" : b.top10Percent > 50 ? "+25 risk" : "neutral",
      !b.holderDataAvailable
        ? "Top-10 share unknown — high-volume tokens may exceed RPC index limits."
        : b.top10Percent > 50
          ? "A small group could coordinate a mass sell-off."
          : "Supply is spread across many holders rather than a tight cluster."
    ),
    finding(
      "Launch Bundle Clustering",
      b.detected ? `${b.walletCount} wallets clustered` : "Not detected",
      b.detected ? "+25 risk" : "neutral",
      b.detected
        ? "Many wallets bought in the same block window, suggesting coordinated sniping."
        : "No abnormal launch-time wallet clustering was detected."
    ),
    finding(
      "DEX Liquidity",
      l.poolFound ? `$${Math.round(l.liquidityUsd || 0).toLocaleString("en-US")} USD` : "No pool found",
      !l.poolFound ? "+5 risk" : l.liquidityUsd != null && l.liquidityUsd < 10000 ? "+15 risk" : "neutral",
      l.poolFound
        ? l.liquidityUsd != null && l.liquidityUsd < 10000
          ? "Thin liquidity means large sells will move the price sharply."
          : "An active pool exists, making exits more feasible."
        : "Without a DEX pool, selling may be impossible or extremely costly."
    ),
  ];
}

async function runTokenAuditLocal({ tokenAddress }, { llmClient, dataSource }) {
  const scan = await runTokenScan(tokenAddress);
  const ai = await generateRiskSummary(scan, { llmClient });
  const picked = pickTokenVerdict(ai, scan);
  return buildReport({
    agentId: "token-audit",
    input: tokenAddress,
    riskScore: scan.riskScore,
    riskLevel: scan.riskLevel,
    verdict: picked.verdict,
    keyFindings: tokenFindingsFromScan(scan),
    recommendations: deriveTokenRecs(scan),
    confidence: picked.aiUsed ? `${tokenConfidence(scan)}; AI verdict generated` : `${tokenConfidence(scan)}; AI unavailable, on-chain verdict used`,
    dataSource: dataSource || TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: { ...scan, ai_summary_available: picked.aiUsed, ai_summary_reason: picked.aiReason },
    ai_summary_available: picked.aiUsed,
    ai_summary_reason: picked.aiReason,
  });
}

async function runSolanaTokenVerificationLocal(inputs, opts) {
  const { tokenAddress } = inputs;
  const audit = await runTokenAuditLocal({ tokenAddress }, opts);
  const scan = audit.rawEvidence;
  const b = scan.bundleDetection;
  return {
    ...audit,
    agentId: "solana-token-verification",
    rawEvidence: {
      ...scan,
      ai_summary_available: audit.ai_summary_available,
      ai_summary_reason: audit.ai_summary_reason,
      subModules: {
        bundle: scan.bundleDetection,
        holders: { topHolderPercent: b.topHolderPercent, top10Percent: b.top10Percent, riskFlags: b.riskFlags || [] },
        liquidity: scan.liquidityLock,
      },
    },
    evidence: {
      ...scan,
      ai_summary_available: audit.ai_summary_available,
      ai_summary_reason: audit.ai_summary_reason,
      subModules: {
        bundle: scan.bundleDetection,
        holders: { topHolderPercent: b.topHolderPercent, top10Percent: b.top10Percent, riskFlags: b.riskFlags || [] },
        liquidity: scan.liquidityLock,
      },
    },
  };
}

async function runContractSecurityLocal({ tokenAddress }) {
  const scan = await runTokenScan(tokenAddress);
  const a = scan.authorityCheck;
  const score = (a.mintAuthority === "ACTIVE" ? 50 : 0) + (a.freezeAuthority === "ACTIVE" ? 50 : 0);
  const level = score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";
  const verdict = score === 0
    ? "Both mint and freeze authorities are revoked, so the deployer cannot mint new tokens or freeze holder wallets."
    : score >= 50
      ? "Active mint or freeze authorities give the deployer direct control to inflate supply or lock holder wallets."
      : "One authority remains active, leaving a partial rug-pull vector on this token contract.";

  return buildReport({
    agentId: "contract-security",
    input: tokenAddress,
    riskScore: score,
    riskLevel: level,
    verdict,
    keyFindings: [
      finding(
        "Mint Authority",
        a.mintAuthority === "ACTIVE" ? `Active (${a.mintAuthorityAddress || "unknown"})` : "Revoked",
        a.mintAuthority === "ACTIVE" ? "+50 risk" : "neutral",
        a.mintAuthority === "ACTIVE"
          ? "The token creator can mint unlimited new tokens at any time."
          : "New tokens cannot be minted, removing inflation risk from the deployer."
      ),
      finding(
        "Freeze Authority",
        a.freezeAuthority === "ACTIVE" ? `Active (${a.freezeAuthorityAddress || "unknown"})` : "Revoked",
        a.freezeAuthority === "ACTIVE" ? "+50 risk" : "neutral",
        a.freezeAuthority === "ACTIVE"
          ? "The deployer can freeze any wallet holding this token."
          : "Holder balances cannot be frozen by the token creator."
      ),
    ],
    recommendations: score === 0
      ? ["Proceed with standard due diligence on holders and liquidity — contract authorities are safely locked."]
      : [
          ...(a.mintAuthority === "ACTIVE" ? ["Do not buy until mint authority is permanently revoked on-chain."] : []),
          ...(a.freezeAuthority === "ACTIVE" ? ["Avoid holding until freeze authority is revoked — your wallet could be frozen."] : []),
          "Verify authority status yourself on Solscan before making any trade.",
        ].slice(0, 4),
    confidence: tokenConfidence(scan),
    dataSource: TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: {
      mintAuthority: a.mintAuthority,
      freezeAuthority: a.freezeAuthority,
      mintAuthorityAddress: a.mintAuthorityAddress,
      freezeAuthorityAddress: a.freezeAuthorityAddress,
    },
  });
}

async function runWalletAuditLocal({ walletAddress }) {
  const profile = await getWalletProfile(walletAddress);
  const score = Math.min(
    100,
    (profile.ageDays != null && profile.ageDays < 7 ? 40 : profile.ageDays != null && profile.ageDays < 30 ? 20 : 0)
      + (profile.txCountSampled < 5 ? 30 : 0)
      + (profile.botFlag ? 20 : 0)
  );
  const level = score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";
  const ageLabel = profile.ageDays != null ? `~${profile.ageDays} days since earliest scanned transaction` : "unknown activity span";
  const verdict = profile.botFlag
    ? `This wallet shows high-frequency activity within its first day and holds ${profile.balanceLabel}, which warrants extra scrutiny before trusting it.`
    : `This wallet holds ${profile.balanceLabel} with ${profile.txCountSampled.toLocaleString()} transactions sampled and earliest activity ${ageLabel}.`;

  const keyFindings = [
    finding(
      "Current SOL Balance",
      profile.balanceLabel,
      profile.balanceSol >= 1_000_000 ? "+10 risk" : "neutral",
      profile.balanceSol >= 1_000_000
        ? "Very large balances usually belong to exchanges or treasuries — confirm counterparty identity."
        : "Native SOL balance reflects funds available for fees and transfers on Solana mainnet."
    ),
    finding(
      "Account Activity Span",
      ageLabel,
      profile.ageDays != null && profile.ageDays < 7 ? "+40 risk" : profile.ageDays != null && profile.ageDays < 30 ? "+20 risk" : "neutral",
      profile.ageDays != null && profile.ageDays < 7
        ? "Very recent first activity means limited track record for trust decisions."
        : "Longer activity history provides more behavioral data to assess legitimacy."
    ),
    finding(
      "Transactions Sampled",
      profile.txCountSampled.toLocaleString(),
      profile.txCountSampled < 5 ? "+30 risk" : "neutral",
      profile.txCountSampled < 5
        ? "Minimal history makes it hard to distinguish legitimate users from throwaway wallets."
        : "Sufficient transaction volume exists to profile typical wallet behavior."
    ),
  ];
  if (profile.botFlag) {
    keyFindings.push(finding("Bot Heuristic", "High-frequency new wallet", "+20 risk", "Burst activity on a brand-new wallet often indicates automated trading bots."));
  }

  return buildReport({
    agentId: "wallet-audit",
    input: walletAddress,
    riskScore: score,
    riskLevel: level,
    verdict,
    keyFindings,
    recommendations: walletRecommendations(profile),
    confidence: walletConfidence(profile),
    dataSource: WALLET_SOURCES,
    rawEvidence: {
      lamports: profile.lamports,
      balanceSol: profile.balanceSol,
      balanceLabel: profile.balanceLabel,
      ageDays: profile.ageDays,
      txCountSampled: profile.txCountSampled,
      historyComplete: profile.historyComplete,
      firstTxAt: profile.firstTxAt,
      lastTxAt: profile.lastTxAt,
      botFlag: profile.botFlag,
    },
  });
}

async function runWalletVerificationLocal({ walletAddress }) {
  const base = await runWalletAuditLocal({ walletAddress });
  const linked = EXPLOITS.filter((e) => (e.relatedWallets || []).some((w) => w === walletAddress));
  let score = base.riskScore;
  let level = base.riskLevel;
  const keyFindings = [...base.keyFindings];
  const recommendations = [...base.recommendations];

  if (linked.length) {
    keyFindings.push(finding(
      "Exploit Database Match",
      linked.map((e) => e.project).join(", "),
      "+40 risk",
      "This wallet address appears in SolGuard's known exploit incident records."
    ));
    score = Math.min(100, score + 40);
    if (score >= 50) level = "HIGH";
    else if (score >= 20 && level === "LOW") level = "MEDIUM";
    recommendations.unshift("Do not send funds — cross-reference this wallet on Solscan and block if tied to known exploits.");
  }

  const verdict = linked.length
    ? `${base.verdict} This wallet also matches ${linked.length} known exploit incident(s) in our database.`
    : base.verdict;

  const rawEvidence = {
    ...base.rawEvidence,
    exploitMatches: linked.map(({ id, project, vector, date, lossUsd }) => ({ id, project, vector, date, lossUsd })),
  };

  return buildReport({
    ...base,
    agentId: "wallet-verification",
    verdict,
    summary: verdict,
    riskScore: score,
    riskLevel: level,
    keyFindings,
    recommendations: recommendations.slice(0, 4),
    rawEvidence,
    evidence: rawEvidence,
  });
}

async function runWebsiteSecurityLocal({ url }) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const headers = Object.fromEntries(res.headers);
    const flags = [];
    if (!url.startsWith("https://")) flags.push("Site not served over HTTPS");
    if (!headers["strict-transport-security"]) flags.push("Missing HSTS header");
    if (!headers["content-security-policy"]) flags.push("Missing Content-Security-Policy header");
    if (!headers["x-frame-options"]) flags.push("Missing X-Frame-Options");
    const score = Math.min(80, flags.length * 15);
    const level = score >= 45 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW";
    const verdict = flags.length
      ? `The site responded with HTTP ${res.status} but is missing ${flags.length} core security header(s), increasing phishing and injection risk.`
      : `The site responded with HTTP ${res.status} and has core security headers configured.`;

    return buildReport({
      agentId: "website-security",
      input: url,
      riskScore: score,
      riskLevel: level,
      verdict,
      keyFindings: [
        finding("HTTPS", url.startsWith("https://") ? "Enabled" : "Not used", !url.startsWith("https://") ? "+15 risk" : "neutral", !url.startsWith("https://") ? "Unencrypted connections expose users to interception." : "Traffic is encrypted in transit."),
        finding("HSTS", headers["strict-transport-security"] ? "Present" : "Missing", !headers["strict-transport-security"] ? "+15 risk" : "neutral", !headers["strict-transport-security"] ? "Browsers may fall back to insecure HTTP without HSTS." : "HSTS helps enforce HTTPS connections."),
        finding("Content-Security-Policy", headers["content-security-policy"] ? "Present" : "Missing", !headers["content-security-policy"] ? "+15 risk" : "neutral", !headers["content-security-policy"] ? "Missing CSP increases XSS attack surface." : "CSP restricts untrusted script execution."),
        finding("X-Frame-Options", headers["x-frame-options"] ? "Present" : "Missing", !headers["x-frame-options"] ? "+15 risk" : "neutral", !headers["x-frame-options"] ? "Site may be embeddable in clickjacking frames." : "Clickjacking protection is enabled."),
      ],
      recommendations: flags.length
        ? flags.map((f) => `Ask the site operator to fix: ${f}.`)
        : ["Security headers look adequate — continue verifying smart contract and token risks separately."],
      confidence: "Medium — single HTTP response snapshot; headers may vary by route",
      dataSource: WEB_SOURCES,
      rawEvidence: { status: res.status, headers, flags },
    });
  } catch (e) {
    return buildReport({
      agentId: "website-security",
      input: url,
      riskScore: 60,
      riskLevel: "HIGH",
      verdict: `The site at ${url} could not be reached, which is a red flag for project legitimacy.`,
      keyFindings: [finding("Reachability", "Failed", "+60 risk", "Unreachable sites often indicate scams or abandoned projects.")],
      recommendations: ["Do not connect your wallet to this site until it is reachable over HTTPS.", "Verify the official domain through the project's social channels."],
      confidence: "Low — connection failed before headers could be read",
      dataSource: WEB_SOURCES,
      rawEvidence: { error: e.message },
    });
  }
}

async function runOpenClawLocal({ config }) {
  const analysis = analyzeOpenClawConfig(config);
  if (analysis.error) return { error: analysis.error };
  return buildReport({
    agentId: "openclaw-ai-agent-verification",
    input: config.slice(0, 120) + (config.length > 120 ? "…" : ""),
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    verdict: analysis.verdict,
    keyFindings: analysis.keyFindings,
    recommendations: analysis.recommendations,
    confidence: analysis.confidence,
    dataSource: CONFIG_SOURCES,
    rawEvidence: {
      agentName: analysis.config?.name || null,
      gatewayAuth: analysis.config?.gateway?.auth ?? analysis.config?.auth ?? null,
      tools: analysis.config?.tools || [],
      skills: analysis.config?.skills || [],
      auditType: "rule-based-static-analysis",
    },
  });
}

/**
 * Run an agent locally (CLI premium mode).
 * @param {string} agentId
 * @param {object} inputs
 * @param {{ llmClient?: object, dataSource?: string[] }} opts
 */
export async function runAgentLocal(agentId, inputs, { llmClient, dataSource } = {}) {
  switch (agentId) {
    case "ai-consultant":
      return runConsultant(inputs, { llmClient, dataSource });
    case "solana-token-verification":
      return runSolanaTokenVerificationLocal(inputs, { llmClient, dataSource });
    case "contract-security":
      return runContractSecurityLocal(inputs);
    case "wallet-verification":
      return runWalletVerificationLocal(inputs);
    case "website-security":
      return runWebsiteSecurityLocal(inputs);
    case "openclaw-ai-agent-verification":
      return runOpenClawLocal(inputs);
    default:
      throw new Error(`Agent "${agentId}" does not support premium local mode`);
  }
}
