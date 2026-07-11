// Agent registry — single source of truth for the marketplace.
import { runTokenScan, isValidSolanaAddress } from "./scanEngine";
import { generateRiskSummary, isInvalidAiVerdict } from "./aiSummary";
import { buildReport, buildOnChainVerdict, finding, formatSol, impactFromScore, holderConcentrationFinding, holderShareLabel, normalizeRiskScore } from "./reportBuilder";
import { analyzeOpenClawConfig } from "./openclawAudit";
import { createIntegrityProof } from "./integrityProof";
import { storeEncryptedRecord } from "./encryptionVault";
import { EXPLOITS } from "./exploits";
import { runConsultant } from "./agents/consultant";
import { createServerOpenRouterClient } from "./llm/client";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
let _conn = null;
function getConnection() { if (!_conn) _conn = new Connection(RPC_URL, "confirmed"); return _conn; }

let _serverLlm = null;
function getServerLlmClient() {
  if (!_serverLlm) _serverLlm = createServerOpenRouterClient();
  return _serverLlm;
}

// ---------- INPUT VALIDATORS (executor prep — route validates via runValidation first) ----------
function validateSolanaToken(inputs) {
  const a = inputs?.tokenAddress?.trim();
  if (!isValidSolanaAddress(a)) return { error: "Invalid Solana token mint address" };
  return { tokenAddress: a };
}
function validateSolanaWallet(inputs) {
  const a = inputs?.walletAddress?.trim();
  if (!isValidSolanaAddress(a)) return { error: "Invalid Solana wallet address" };
  return { walletAddress: a };
}
function validateUrl(inputs) {
  const u = inputs?.url?.trim();
  try { new URL(u); return { url: u }; } catch { return { error: "Invalid URL" }; }
}
function validateQuery(inputs) {
  const q = inputs?.query?.trim();
  if (!q || q.length < 5) return { error: "Question must be at least 5 characters" };
  return { query: q.slice(0, 1000) };
}
function validateOpenClawConfig(inputs) {
  const config = inputs?.config?.trim();
  if (!config || config.length < 2) return { error: "Agent config JSON is required" };
  if (config.length > 32768) return { error: "Config exceeds 32KB limit" };
  return { config };
}
function validateCpdvData(inputs) {
  const cpdv_data = inputs?.cpdv_data?.trim();
  if (!cpdv_data) return { error: "Data payload (cpdv_data) is required" };
  if (cpdv_data.length > 500000) return { error: "Payload exceeds 500KB limit" };
  return { cpdv_data };
}
function validateCqcvData(inputs) {
  const cqcv_data = inputs?.cqcv_data?.trim();
  if (!cqcv_data) return { error: "Data to encrypt (cqcv_data) is required" };
  if (cqcv_data.length > 500000) return { error: "Payload exceeds 500KB limit" };
  return { cqcv_data };
}

const TOKEN_SOURCES = ["Helius RPC", "DexScreener", "Solana Mainnet"];
const WALLET_SOURCES = ["Helius RPC", "Solana Mainnet"];
const WEB_SOURCES = ["HTTP Security Scan"];
const AI_SOURCES = ["OpenRouter AI"];
const CONFIG_SOURCES = ["Static JSON rule engine"];
const PRIVACY_SOURCES = ["SHA-256 commitment", "MongoDB proof store"];
const VAULT_SOURCES = ["Node.js crypto (AES-256-GCM)", "MongoDB vault"];

// ---------- AGENT EXECUTORS ----------
// Cache full scan to avoid hammering RPC across agents
const scanCache = new Map();
async function getCachedScan(tokenAddress) {
  const cached = scanCache.get(tokenAddress);
  if (cached && Date.now() - cached.ts < 60_000) return cached.scan;
  const scan = await runTokenScan(tokenAddress);
  scanCache.set(tokenAddress, { ts: Date.now(), scan });
  return scan;
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
  const findings = [
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
      !b.holderDataAvailable ? "unknown" : (b.topHolderPercent > 20 ? "+10 risk" : "neutral"),
      !b.holderDataAvailable
        ? "Concentration could not be measured — do not assume a safe distribution."
        : (b.topHolderPercent > 20
          ? "A single wallet controls a large share, increasing dump risk."
          : "No single wallet dominates supply, which supports healthier distribution.")
    ),
    finding(
      "Top 10 Holder Concentration",
      holderShareLabel(b, true) + (b.holderDataAvailable ? " of supply" : ""),
      !b.holderDataAvailable ? "unknown" : (b.top10Percent > 50 ? "+25 risk" : "neutral"),
      !b.holderDataAvailable
        ? "Top-10 share unknown — high-volume tokens may exceed RPC index limits."
        : (b.top10Percent > 50
          ? "A small group could coordinate a mass sell-off."
          : "Supply is spread across many holders rather than a tight cluster.")
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
      !l.poolFound ? "+5 risk" : (l.liquidityUsd != null && l.liquidityUsd < 10000 ? "+15 risk" : "neutral"),
      l.poolFound
        ? (l.liquidityUsd != null && l.liquidityUsd < 10000
          ? "Thin liquidity means large sells will move the price sharply."
          : "An active pool exists, making exits more feasible.")
        : "Without a pool you may not be able to sell this token on a DEX."
    ),
  ];
  return findings;
}

async function execTokenAudit({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const ai = await generateRiskSummary(scan);
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
    dataSource: TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: { ...scan, ai_summary_available: picked.aiUsed, ai_summary_reason: picked.aiReason },
    ai_summary_available: picked.aiUsed,
    ai_summary_reason: picked.aiReason,
  });
}

async function execContractSecurity({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
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
    dataSource: ["Helius RPC", "Solana Mainnet"],
    scannedAt: scan.scannedAt,
    rawEvidence: {
      mintAuthority: a.mintAuthority,
      freezeAuthority: a.freezeAuthority,
      mintAuthorityAddress: a.mintAuthorityAddress,
      freezeAuthorityAddress: a.freezeAuthorityAddress,
    },
  });
}

async function execBundleDetection({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const b = scan.bundleDetection;
  const holderScore = b.holderDataAvailable ? Math.min(40, b.top10Percent * 0.5) : 0;
  const score = Math.round((b.detected ? 30 : 0) + holderScore + (b.earlySlotClustering ? 20 : 0));
  const level = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  const holderPhrase = b.holderDataAvailable
    ? `top 10 holders controlling ${b.top10Percent.toFixed(1)}% of supply`
    : "holder concentration unverified (RPC could not fetch largest accounts)";
  const verdict = b.detected
    ? `This token shows ${b.walletCount} wallets clustered at launch with ${holderPhrase}, indicating coordinated buying activity.`
    : b.holderDataAvailable
      ? `No launch bundle clustering was detected and top 10 wallets hold ${b.top10Percent.toFixed(1)}% of supply.`
      : "No launch bundle clustering was detected, but holder concentration could not be verified on-chain.";
  const confidence = b.holderDataAvailable
    ? "High — last 200 mint signatures analyzed; top-20 holder balances from getTokenLargestAccounts"
    : `Medium — bundle clustering checked; holder data unavailable (${b.holderDataError || "RPC error"})`;

  return buildReport({
    agentId: "bundle-detection",
    input: tokenAddress,
    riskScore: score,
    riskLevel: level,
    verdict,
    keyFindings: [
      finding(
        "Bundle Cluster Detected",
        b.detected ? "Yes" : "No",
        b.detected ? "+30 risk" : "neutral",
        b.detected
          ? "Multiple wallets transacted in tight slot groups typical of bundled snipes."
          : "Launch activity does not show coordinated multi-wallet clustering."
      ),
      finding(
        "Clustered Wallet Count",
        String(b.walletCount),
        b.walletCount >= 50 ? "+10 risk" : "neutral",
        b.walletCount >= 50
          ? "A large number of wallets moved together, suggesting bot or team coordination."
          : "Wallet count in the cluster is within normal launch noise."
      ),
      finding(
        "Early Slot Clustering",
        b.earlySlotClustering ? "Detected" : "Not detected",
        b.earlySlotClustering ? "+20 risk" : "neutral",
        b.earlySlotClustering
          ? "Abnormal transaction density in early slots matches known snipe-bundle patterns."
          : "Early-block activity looks distributed rather than artificially clustered."
      ),
      holderConcentrationFinding("Top 10 Holder Share", b, { isTop10: true, top10Threshold: 50 }),
      holderConcentrationFinding("Top Holder Share", b, { highThreshold: 20 }),
    ],
    recommendations: b.detected
      ? [
          "Assume early buyers may sell together — wait for holder dispersion before entering.",
          "Check whether clustered wallets still hold or have already distributed to new addresses.",
          "Compare launch wallet behavior on Solscan against organic holder growth.",
        ]
      : b.holderDataAvailable
        ? ["No bundle red flags — still verify mint/freeze authorities and liquidity separately."]
        : ["Re-run holder checks when RPC is available — concentration was not verified this scan."],
    confidence,
    dataSource: ["Helius RPC", "Solana Mainnet"],
    scannedAt: scan.scannedAt,
    rawEvidence: b,
  });
}

async function execHolderDistribution({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const b = scan.bundleDetection;

  if (!b.holderDataAvailable) {
    return buildReport({
      agentId: "holder-distribution",
      input: tokenAddress,
      riskScore: 30,
      riskLevel: "MEDIUM",
      verdict: "Holder concentration could not be verified — the RPC did not return largest-account data for this token.",
      keyFindings: [
        holderConcentrationFinding("Top Holder Share", b, { highThreshold: 30 }),
        holderConcentrationFinding("Top 10 Share", b, { isTop10: true, top10Threshold: 50 }),
      ],
      recommendations: [
        "Do not assume low concentration — verify manually on Solscan or Birdeye.",
        "Retry this scan later; high-volume tokens may temporarily overload RPC index services.",
      ],
      confidence: `Low — holder data unavailable (${b.holderDataError || "RPC error"})`,
      dataSource: TOKEN_SOURCES,
      scannedAt: scan.scannedAt,
      rawEvidence: { topHolderPercent: null, top10Percent: null, holderDataAvailable: false, holderDataError: b.holderDataError },
    });
  }

  const score = b.topHolderPercent > 50 ? 90 : b.topHolderPercent > 30 ? 60 : b.topHolderPercent > 15 ? 30 : 10;
  const level = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const verdict = `The largest holder controls ${b.topHolderPercent.toFixed(1)}% of supply and the top 10 wallets control ${b.top10Percent.toFixed(1)}%, ${score >= 60 ? "creating significant concentration risk" : "which is within typical ranges"}.`;

  return buildReport({
    agentId: "holder-distribution",
    input: tokenAddress,
    riskScore: score,
    riskLevel: level,
    verdict,
    keyFindings: [
      holderConcentrationFinding("Top Holder Share", b, { highThreshold: 30 }),
      holderConcentrationFinding("Top 10 Share", b, { isTop10: true, top10Threshold: 50 }),
    ],
    recommendations: score >= 60
      ? ["Avoid large positions until top-holder share drops below 15%.", "Monitor top-holder wallets for outbound transfers on Solscan."]
      : ["Holder distribution looks acceptable — continue checking authorities and liquidity."],
    confidence: tokenConfidence(scan),
    dataSource: TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: { topHolderPercent: b.topHolderPercent, top10Percent: b.top10Percent },
  });
}

async function execLiquidityVerification({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const l = scan.liquidityLock;
  const score = !l.poolFound ? 30 : (l.liquidityUsd && l.liquidityUsd < 10000 ? 60 : 10);
  const level = score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
  const verdict = l.poolFound
    ? `An active DEX pool holds approximately $${Math.round(l.liquidityUsd || 0).toLocaleString()} in liquidity, ${l.liquidityUsd != null && l.liquidityUsd < 10000 ? "which is thin and increases exit risk" : "providing reasonable depth for trading"}.`
    : "No active DEX liquidity pool was found for this token, making on-chain exits difficult or impossible.";

  return buildReport({
    agentId: "liquidity-verification",
    input: tokenAddress,
    riskScore: score,
    riskLevel: level,
    verdict,
    keyFindings: [
      finding("Pool Status", l.poolFound ? "Active pool found" : "No pool", l.poolFound ? "neutral" : "+30 risk", l.poolFound ? "A DEX pair exists for this token." : "Without a pool you may be unable to sell on a DEX."),
      finding("Liquidity Depth", l.poolFound ? `$${Math.round(l.liquidityUsd || 0).toLocaleString()} USD` : "N/A", l.liquidityUsd != null && l.liquidityUsd < 10000 ? "+30 risk" : "neutral", l.liquidityUsd != null && l.liquidityUsd < 10000 ? "Low depth means large sells will slip heavily." : "Liquidity depth appears adequate for modest trades."),
    ],
    recommendations: !l.poolFound
      ? ["Do not purchase until a verified pool with real liquidity appears.", "Confirm pool authenticity on DexScreener before trading."]
      : l.liquidityUsd != null && l.liquidityUsd < 10000
        ? ["Use limit orders and small sizes to avoid slippage.", "Wait for liquidity to deepen before taking large positions."]
        : ["Liquidity looks sufficient — still verify LP lock/burn status separately."],
    confidence: "Medium — pool data from DexScreener; LP burn not verified on-chain",
    dataSource: ["DexScreener", "Helius RPC"],
    scannedAt: scan.scannedAt,
    rawEvidence: l,
  });
}
async function execLiquidityLock({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const l = scan.liquidityLock;
  const verdict = l.poolFound
    ? "A DEX pool exists but LP token burn status could not be verified automatically — manual confirmation is required."
    : "No DEX pool was found, so there is no liquidity to lock or burn.";
  return buildReport({
    agentId: "liquidity-lock-analysis",
    input: tokenAddress,
    riskScore: l.poolFound ? 40 : 30,
    riskLevel: "MEDIUM",
    verdict,
    keyFindings: [
      finding("Pool Exists", l.poolFound ? "Yes" : "No", l.poolFound ? "neutral" : "+30 risk", l.poolFound ? "Trading pool detected on a DEX." : "No pool means no tradable liquidity."),
      finding("LP Burn Verified", "Unverified", "+40 risk", "Without burned LP tokens the deployer may still remove liquidity."),
    ],
    recommendations: ["Check Raydium/Orca pool LP token mint for burn transactions to the system program.", "Avoid large buys until LP burn is confirmed on-chain."],
    confidence: "Low — LP burn requires manual pool inspection",
    dataSource: ["DexScreener", "Helius RPC"],
    scannedAt: scan.scannedAt,
    rawEvidence: l,
  });
}

async function execMetadata({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const m = scan.metadata;
  const issues = [];
  if (!m.name) issues.push("name");
  if (!m.symbol) issues.push("symbol");
  if (!m.image) issues.push("logo");
  const score = Math.min(60, issues.length * 15);
  const verdict = issues.length
    ? `Token metadata is incomplete — missing ${issues.join(", ")} — which is common in rushed or anonymous launches.`
    : `Token metadata is complete (${m.name || "unknown"} / $${m.symbol || "?"}).`;
  return buildReport({
    agentId: "metadata-verification",
    input: tokenAddress,
    riskScore: score,
    riskLevel: score >= 30 ? "MEDIUM" : "LOW",
    verdict,
    keyFindings: [
      finding("Token Name", m.name || "Missing", !m.name ? "+15 risk" : "neutral", !m.name ? "Missing name makes the token harder to verify in wallets and explorers." : "Name is present in on-chain metadata."),
      finding("Token Symbol", m.symbol ? `$${m.symbol}` : "Missing", !m.symbol ? "+15 risk" : "neutral", !m.symbol ? "Missing symbol reduces transparency in trading interfaces." : "Symbol is set and visible on explorers."),
      finding("Logo / Image", m.image ? "Present" : "Missing", !m.image ? "+15 risk" : "neutral", !m.image ? "No logo often indicates a low-effort or copycat token." : "Logo URL is present in metadata."),
    ],
    recommendations: issues.length ? issues.map((x) => `Verify token identity through independent sources — ${x} is missing from metadata.`) : ["Metadata looks complete — still verify contract authorities and liquidity."],
    confidence: tokenConfidence(scan),
    dataSource: TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: m,
  });
}

async function execRugProbability({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const ai = await generateRiskSummary(scan);
  const picked = pickTokenVerdict(ai, scan);
  return buildReport({
    agentId: "rug-probability",
    input: tokenAddress,
    riskScore: scan.riskScore,
    riskLevel: scan.riskLevel,
    verdict: picked.verdict,
    keyFindings: tokenFindingsFromScan(scan),
    recommendations: deriveTokenRecs(scan),
    confidence: picked.aiUsed ? "High — AI synthesis over full on-chain scan" : "Medium — on-chain factors only, AI unavailable",
    dataSource: [...TOKEN_SOURCES, ...AI_SOURCES],
    scannedAt: scan.scannedAt,
    rawEvidence: { factors: scan.riskFactors, scan },
    ai_summary_available: picked.aiUsed,
    ai_summary_reason: picked.aiReason,
  });
}

async function execRiskScore({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const verdict = `Composite weighted score is ${normalizeRiskScore(scan.riskScore)}/100 (${scan.riskLevel}) across mint/freeze authorities, holder concentration, bundle signals, and liquidity.`;
  return buildReport({
    agentId: "risk-score",
    input: tokenAddress,
    riskScore: scan.riskScore,
    riskLevel: scan.riskLevel,
    verdict,
    keyFindings: tokenFindingsFromScan(scan),
    recommendations: deriveTokenRecs(scan),
    confidence: tokenConfidence(scan),
    dataSource: TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: { breakdown: scan },
  });
}

async function execMarketManipulation({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const b = scan.bundleDetection;
  const holderScore = b.holderDataAvailable ? Math.min(40, b.top10Percent * 0.6) : 0;
  const score = Math.round((b.detected ? 40 : 0) + holderScore);
  const level = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const verdict = score > 50
    ? `Launch clustering plus ${holderShareLabel(b, true)} top-10 concentration suggests coordinated price manipulation is likely.`
    : "No strong manipulation signals were detected from holder concentration or launch clustering.";
  return buildReport({
    agentId: "market-manipulation",
    input: tokenAddress,
    riskScore: score,
    riskLevel: level,
    verdict,
    keyFindings: [
      finding("Bundle Clustering", b.detected ? "Detected" : "None", b.detected ? "+40 risk" : "neutral", b.detected ? "Coordinated wallets at launch can pump and dump price." : "Launch activity appears organic."),
      holderConcentrationFinding("Top 10 Concentration", b, { isTop10: true, top10Threshold: 50 }),
    ],
    recommendations: score > 50
      ? ["Avoid FOMO entries during volume spikes from clustered wallets.", "Wait for holder count to grow organically before trading."]
      : ["Manipulation signals are low — continue standard token due diligence."],
    confidence: tokenConfidence(scan),
    dataSource: TOKEN_SOURCES,
    scannedAt: scan.scannedAt,
    rawEvidence: b,
  });
}

async function execVolumeAuthenticity({ tokenAddress }) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { cache: "no-store" });
    const j = await res.json();
    const pair = (j?.pairs || []).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (!pair) {
      return buildReport({
        agentId: "volume-authenticity",
        input: tokenAddress,
        riskScore: 40,
        riskLevel: "MEDIUM",
        verdict: "No DEX trading data was found, so 24-hour volume authenticity could not be assessed.",
        keyFindings: [finding("DEX Data", "Unavailable", "+40 risk", "Without volume data wash trading cannot be ruled out.")],
        recommendations: ["Confirm the token is listed and actively traded before relying on volume metrics."],
        confidence: "Low — no DexScreener pair data",
        dataSource: ["DexScreener"],
        rawEvidence: {},
      });
    }
    const v24 = pair.volume?.h24 || 0;
    const liq = pair.liquidity?.usd || 0;
    const turnoverRatio = liq > 0 ? v24 / liq : 0;
    const suspicious = turnoverRatio > 50;
    const verdict = suspicious
      ? `24h volume of $${Math.round(v24).toLocaleString()} on $${Math.round(liq).toLocaleString()} liquidity (${turnoverRatio.toFixed(1)}x turnover) suggests possible wash trading.`
      : `24h turnover of ${turnoverRatio.toFixed(1)}x on $${Math.round(liq).toLocaleString()} liquidity appears within normal ranges.`;
    return buildReport({
      agentId: "volume-authenticity",
      input: tokenAddress,
      riskScore: suspicious ? 70 : 20,
      riskLevel: suspicious ? "HIGH" : "LOW",
      verdict,
      keyFindings: [
        finding("24h Volume", `$${Math.round(v24).toLocaleString()}`, suspicious ? "+35 risk" : "neutral", suspicious ? "Extremely high volume relative to liquidity is a wash-trade red flag." : "Volume level looks plausible for the pool size."),
        finding("Pool Liquidity", `$${Math.round(liq).toLocaleString()}`, "neutral", "Liquidity depth sets the baseline for expected organic turnover."),
        finding("Turnover Ratio", `${turnoverRatio.toFixed(1)}x`, suspicious ? "+35 risk" : "neutral", suspicious ? "Turnover above 50x often indicates artificial volume inflation." : "Turnover ratio is within typical bounds."),
      ],
      recommendations: suspicious
        ? ["Treat displayed volume skeptically until confirmed by independent analytics.", "Check whether the same wallets are repeatedly swapping to inflate volume."]
        : ["Volume appears organic — still verify holder and authority risks separately."],
      confidence: "Medium — based on DexScreener 24h aggregates",
      dataSource: ["DexScreener"],
      rawEvidence: { v24, liq, turnoverRatio, pairUrl: pair.url },
    });
  } catch {
    return buildReport({
      agentId: "volume-authenticity",
      input: tokenAddress,
      riskScore: 30,
      riskLevel: "MEDIUM",
      verdict: "Volume data could not be retrieved from DexScreener at this time.",
      keyFindings: [finding("Data Availability", "Failed", "+30 risk", "Unable to assess wash trading without volume metrics.")],
      recommendations: ["Retry later or verify volume manually on DexScreener."],
      confidence: "Low — API request failed",
      dataSource: ["DexScreener"],
      rawEvidence: {},
    });
  }
}

async function execWalletAudit({ walletAddress }) {
  const profile = await getWalletProfile(walletAddress);
  const score = Math.min(100, (profile.ageDays != null && profile.ageDays < 7 ? 40 : profile.ageDays != null && profile.ageDays < 30 ? 20 : 0) + (profile.txCountSampled < 5 ? 30 : 0) + (profile.botFlag ? 20 : 0));
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

async function execSolanaTokenVerification({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const audit = await execTokenAudit({ tokenAddress });
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

async function execWalletVerification({ walletAddress }) {
  const base = await execWalletAudit({ walletAddress });
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

async function execDeveloperWalletAnalysis({ walletAddress }) {
  const r = await execWalletAudit({ walletAddress });
  return buildReport({
    ...r,
    agentId: "developer-wallet-analysis",
    verdict: `Developer wallet assessment: ${r.verdict}`,
    summary: `Developer wallet assessment: ${r.verdict}`,
  });
}

async function execSocialVerification({ tokenAddress }) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { cache: "no-store" });
    const j = await res.json();
    const pair = (j?.pairs || [])[0];
    const info = pair?.info || {};
    const socials = info.socials || [];
    const websites = info.websites || [];
    const has = { twitter: socials.some((s) => /twitter|x\./i.test(s.url || s.type)), telegram: socials.some((s) => /telegram/i.test(s.url || s.type)), website: websites.length > 0 };
    const missing = Object.entries(has).filter(([, v]) => !v).map(([k]) => k);
    const score = missing.length * 20;
    const verdict = missing.length
      ? `Token social presence is incomplete — missing ${missing.join(", ")} — which reduces transparency for investors.`
      : "Token has linked Twitter, Telegram, and website profiles on DexScreener.";
    return buildReport({
      agentId: "social-verification",
      input: tokenAddress,
      riskScore: score,
      riskLevel: score >= 40 ? "MEDIUM" : "LOW",
      verdict,
      keyFindings: [
        finding("Twitter / X", has.twitter ? "Linked" : "Missing", !has.twitter ? "+20 risk" : "neutral", !has.twitter ? "No Twitter makes it harder to verify the team publicly." : "Twitter profile is linked."),
        finding("Telegram", has.telegram ? "Linked" : "Missing", !has.telegram ? "+20 risk" : "neutral", !has.telegram ? "Missing Telegram limits community verification channels." : "Telegram is linked."),
        finding("Website", has.website ? "Linked" : "Missing", !has.website ? "+20 risk" : "neutral", !has.website ? "No official website raises legitimacy concerns." : "Website URL is present."),
      ],
      recommendations: missing.length ? missing.map((m) => `Ask the project team to publish a verified ${m} link before investing.`) : ["Social links present — verify they are authentic and actively maintained."],
      confidence: "Medium — social data from DexScreener token profile",
      dataSource: ["DexScreener"],
      rawEvidence: { socials, websites, has },
    });
  } catch {
    return buildReport({
      agentId: "social-verification",
      input: tokenAddress,
      riskScore: 30,
      riskLevel: "MEDIUM",
      verdict: "Social profile data could not be retrieved at this time.",
      keyFindings: [finding("Social Data", "Unavailable", "+30 risk", "Cannot verify community presence without metadata.")],
      recommendations: ["Check social links manually on the project's website and DexScreener."],
      confidence: "Low — API unavailable",
      dataSource: ["DexScreener"],
      rawEvidence: {},
    });
  }
}

async function execWebsiteSecurity({ url }) {
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

async function execAiConsultant({ query }) {
  return runConsultant({ query }, { llmClient: getServerLlmClient(), dataSource: AI_SOURCES });
}

async function execOpenClawVerification({ config }) {
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

async function execPrivateDataVerification({ cpdv_data }, ctx = {}) {
  const proof = await createIntegrityProof(cpdv_data, ctx.userId);
  const verdict = `A cryptographic integrity proof was created — your data was hashed into commitment ${proof.commitment.slice(0, 16)}… and is not stored on our servers.`;
  return buildReport({
    agentId: "private-data-verification",
    input: `[${cpdv_data.length} bytes redacted]`,
    riskScore: 0,
    riskLevel: "LOW",
    verdict,
    keyFindings: [
      finding("Commitment Scheme", proof.algorithm, "neutral", "Uses salted SHA-256 commitment — this is not a zero-knowledge proof circuit."),
      finding("Raw Data Storage", "Not stored", "neutral", "Only the commitment hash and salt are persisted; plaintext never written to MongoDB."),
      finding("Proof ID", proof.proofId, "neutral", "Share this ID so others can verify their copy matches your committed data."),
      finding("Verification URL", proof.proofUrl, "neutral", "Anyone with the original data can confirm integrity at this public page."),
    ],
    recommendations: [
      "Save your original data securely — verification requires the exact byte-identical copy.",
      "Share only the proof URL and proof ID, not the underlying sensitive payload.",
    ],
    confidence: "High — deterministic SHA-256 salted commitment with HMAC-sealed proof record",
    dataSource: PRIVACY_SOURCES,
    rawEvidence: {
      proof_id: proof.proofId,
      proof_url: proof.proofUrl,
      commitment: proof.commitment,
      algorithm: proof.algorithm,
      createdAt: proof.createdAt,
      honestyNote: "Cryptographic integrity proof — not a zero-knowledge proof (ZKP).",
    },
  });
}

async function execQuantumCryptographyVerification({ cqcv_data }, ctx = {}) {
  if (!ctx.userId) return { error: "Authentication required for encrypted storage" };
  const record = await storeEncryptedRecord(cqcv_data, ctx.userId);
  const verdict = `Your data was encrypted with AES-256-GCM and stored under record ${record.recordId} — retrieval requires your connected wallet (this is not post-quantum cryptography).`;
  return buildReport({
    agentId: "quantum-cryptography-verification",
    input: `[${cqcv_data.length} bytes encrypted]`,
    riskScore: 0,
    riskLevel: "LOW",
    verdict,
    keyFindings: [
      finding("Encryption Algorithm", record.algorithm, "neutral", "Industry-standard AES-256-GCM symmetric encryption via Node.js crypto."),
      finding("Post-Quantum Safety", "Not claimed", "unknown", "NIST PQC algorithms (e.g. ML-KEM/Kyber) are not used — do not rely on this for quantum-threat models."),
      finding("Record ID", record.recordId, "neutral", "Ciphertext is keyed to this identifier for owner-only retrieval."),
      finding("Key Management", record.keyLabel, "neutral", "Key derived from server secret — suitable for demo vault, not HSM-backed enterprise KMS."),
    ],
    recommendations: [
      "Use this vault for convenience demos only — not for long-term secrets under quantum-threat assumptions.",
      "Retrieve ciphertext promptly via the decrypt API while authenticated with the same wallet.",
    ],
    confidence: "Medium — AES-256-GCM at rest; owner-scoped access via wallet JWT",
    dataSource: VAULT_SOURCES,
    rawEvidence: {
      record_id: record.recordId,
      decrypt_url: record.decryptUrl,
      algorithm: record.algorithm,
      keyLabel: record.keyLabel,
      createdAt: record.createdAt,
      honestyNote: "High-grade symmetric encryption — not quantum-resistant.",
    },
  });
}

// ---------- AGENT REGISTRY ----------
export const AGENTS = [
  {
    id: "solana-token-verification", name: "Solana Token Verification", category: "Token", icon: "Coins", color: "teal",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~6s",
    description: "Secures Solana SPL token structures with AI-powered anomaly analysis. Consolidates multi-layered token due diligence to scan for rug pulls, mint authority risks, bundle anomalies, and holder distribution concentrations in a single report view.",
    longDescription: "Runs a full on-chain scan with AI narrative plus dedicated sub-module breakdowns for bundle detection, holder concentration, and liquidity depth.",
    features: ["Unified AI risk report", "Bundle clustering", "Holder distribution", "Liquidity depth & locks", "Mint/freeze authority"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execSolanaTokenVerification, marketplaceVisible: true,
  },
  {
    id: "wallet-verification", name: "Wallet Verification", category: "Wallet", icon: "Wallet", color: "teal",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Real-time blockchain behavior profiling across Solana wallet addresses, identifying transaction history anomalies, account age metadata, and historic exploit deployer linkage.",
    longDescription: "Profiles wallet age, activity, and balance via Helius RPC and cross-references the SolGuard exploit intelligence database.",
    features: ["Wallet age & tx history", "Balance check", "Bot heuristics", "Exploit database cross-ref"],
    inputs: [{ key: "walletAddress", label: "Wallet Address", placeholder: "Solana wallet pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }],
    validator: "solanaWallet", executor: execWalletVerification, marketplaceVisible: true,
  },
  {
    id: "token-audit", name: "Token Audit", category: "Token", icon: "Coins", color: "teal",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~5s",
    description: "Comprehensive on-chain audit covering mint authority, freeze authority, holder concentration, liquidity, and bundle launch detection.",
    longDescription: "Runs every core engine in parallel and returns a unified threat report with AI-generated narrative. Best starting point for evaluating any unknown Solana SPL token.",
    features: ["Mint & freeze authority check", "Top holder analysis", "Bundle clustering detection", "DEX pool & liquidity scan", "AI risk narrative"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execTokenAudit, marketplaceVisible: false,
  },
  {
    id: "contract-security", name: "Contract Security", category: "Token", icon: "Lock", color: "rose",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~2s",
    description: "Audits the SPL mint account for active mint and freeze authorities — the single biggest rug vector.",
    longDescription: "Decodes the on-chain mint account and verifies that mint and freeze authorities have been revoked (set to null). Active authorities mean the deployer can mint new supply or freeze holder wallets at will.",
    features: ["Mint authority status", "Freeze authority status", "Authority address resolution"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execContractSecurity, marketplaceVisible: true,
  },
  {
    id: "bundle-detection", name: "Bundle Detection", category: "Token", icon: "Layers", color: "orange",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Detects coordinated wallet clustering and snipe bundles at token launch via slot grouping analysis.",
    longDescription: "Pulls the last 200 signatures touching the mint, groups them by slot, and flags slots with abnormal transaction density typical of bundled launches.",
    features: ["Slot-density clustering", "Top 10 wallet concentration", "Suspicious wallet count"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execBundleDetection, marketplaceVisible: false,
  },
  {
    id: "holder-distribution", name: "Holder Distribution", category: "Token", icon: "Users", color: "amber",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~2s",
    description: "Reveals how concentrated token supply is among top holders.",
    features: ["Top wallet %", "Top 10 wallets %", "Concentration risk score"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execHolderDistribution, marketplaceVisible: false,
  },
  {
    id: "liquidity-verification", name: "Liquidity Verification", category: "Liquidity", icon: "Droplets", color: "cyan",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Verifies an active DEX pool exists and quantifies liquidity depth in USD.",
    features: ["DEX pool discovery", "USD liquidity depth", "Exit-risk scoring"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execLiquidityVerification, marketplaceVisible: false,
  },
  {
    id: "liquidity-lock-analysis", name: "Liquidity Lock Analysis", category: "Liquidity", icon: "Lock", color: "emerald",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Verifies LP token burn / lock status — the strongest defense against deployer-side rugs.",
    features: ["LP burn status", "Pool age", "Lock recommendations"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execLiquidityLock, marketplaceVisible: false,
  },
  {
    id: "metadata-verification", name: "Metadata Verification", category: "Token", icon: "FileText", color: "violet",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~2s",
    description: "Checks token metadata completeness — name, symbol, logo image.",
    features: ["Name presence", "Symbol presence", "Logo image URL"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execMetadata, marketplaceVisible: false,
  },
  {
    id: "rug-probability", name: "Rug Probability", category: "AI", icon: "Sparkles", color: "rose",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~6s",
    description: "AI-synthesized probability that this token is a rug pull, based on all combined signals.",
    features: ["GPT-4o-mini synthesis", "Combined risk factors", "Trader-ready verdict"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execRugProbability, marketplaceVisible: false,
  },
  {
    id: "risk-score", name: "Composite Risk Score", category: "AI", icon: "ShieldAlert", color: "orange",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~5s",
    description: "Single weighted risk score (0–100) across every available engine.",
    features: ["0–100 score", "Severity level", "Per-engine breakdown"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execRiskScore, marketplaceVisible: false,
  },
  {
    id: "market-manipulation", name: "Market Manipulation Detection", category: "Market", icon: "TrendingUp", color: "rose",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~5s",
    description: "Detects price-pump coordination via launch clustering and top-holder concentration.",
    features: ["Bundle clustering", "Holder concentration", "Manipulation likelihood"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execMarketManipulation, marketplaceVisible: false,
  },
  {
    id: "volume-authenticity", name: "Volume Authenticity", category: "Market", icon: "Activity", color: "amber",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Flags wash trading by comparing 24h volume to pool liquidity (turnover ratio).",
    features: ["24h volume", "Turnover ratio", "Wash-trade flag"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execVolumeAuthenticity, marketplaceVisible: false,
  },
  {
    id: "social-verification", name: "Social Verification", category: "Social", icon: "Globe", color: "sky",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Checks for active Twitter, Telegram, and website links in token metadata.",
    features: ["Twitter presence", "Telegram presence", "Website link"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execSocialVerification, marketplaceVisible: false,
  },
  {
    id: "wallet-audit", name: "Wallet Audit", category: "Wallet", icon: "Wallet", color: "teal",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Profiles any Solana wallet: age, transaction count, balance, and bot-behavior heuristics.",
    features: ["Wallet age", "Transaction count", "Balance check", "Bot heuristics"],
    inputs: [{ key: "walletAddress", label: "Wallet Address", placeholder: "Solana wallet pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }],
    validator: "solanaWallet", executor: execWalletAudit, marketplaceVisible: false,
  },
  {
    id: "developer-wallet-analysis", name: "Developer Wallet Analysis", category: "Wallet", icon: "UserCog", color: "violet",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Background check on a token's deployer wallet — age, history, and red flags.",
    features: ["Deployer age", "Historical behavior", "Risk flags"],
    inputs: [{ key: "walletAddress", label: "Developer Wallet Address", placeholder: "Deployer pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }],
    validator: "solanaWallet", executor: execDeveloperWalletAnalysis, marketplaceVisible: false,
  },
  {
    id: "website-security", name: "Website Security", category: "Web", icon: "Shield", color: "cyan",
    price: 0.10, supportedChains: ["Off-chain"], estimatedTime: "~3s",
    description: "Scans a project's official website for security header gaps and HTTPS issues.",
    features: ["HTTPS check", "HSTS", "CSP", "X-Frame-Options"],
    inputs: [{ key: "url", type: "url", label: "Website URL", placeholder: "https://example.com", example: "https://solana.com" }],
    validator: "url", executor: execWebsiteSecurity, marketplaceVisible: true,
  },
  {
    id: "ai-consultant", name: "AI Security Consultant", category: "Advisory", icon: "MessageSquare", color: "teal",
    price: 0.10, supportedChains: ["All"], estimatedTime: "~5s",
    description: "Ask any crypto security question — token risks, attack vectors, best practices.",
    longDescription: "GPT-4o-mini backed expert consultant. Reference specific tokens, exploits, or general security concepts.",
    features: ["Open-ended Q&A", "Attack vector explainers", "Best-practice guidance"],
    inputs: [{ key: "query", type: "text", label: "Your Question", placeholder: "e.g. How do honeypot tokens lock liquidity?", example: "What is the most common Solana token rug-pull pattern in 2025?", multiline: true }],
    validator: "query", executor: execAiConsultant, marketplaceVisible: true,
  },
  {
    id: "openclaw-ai-agent-verification", name: "OpenClaw AI Agent Verification", category: "AI Agent", icon: "Bot", color: "violet",
    price: 0.10, supportedChains: ["Off-chain"], estimatedTime: "~2s",
    description: "Automated configuration audit for OpenClaw-style AI agent JSON — checks authentication, tool permissions, injection surfaces, and session handling via deterministic rules.",
    longDescription: "Submit your agent gateway config as JSON. SolGuard runs static rule-based checks (not LLM inference) for weak auth, dangerous tools, and prompt-injection patterns.",
    features: ["Gateway auth checks", "Tool permission analysis", "Injection surface detection", "Session handling review"],
    inputs: [{
      key: "config",
      type: "json",
      label: "Agent Config (JSON)",
      placeholder: '{"name":"support-agent","gateway":{"auth":"none"},"tools":["http"]}',
      example: "{\"name\":\"support-agent\",\"gateway\":{\"auth\":\"none\"},\"tools\":[\"http\"]}",
      multiline: true,
    }],
    validator: "openClawConfig", executor: execOpenClawVerification, marketplaceVisible: true,
  },
  {
    id: "private-data-verification", name: "Private Data Integrity Proof", category: "Privacy", icon: "Fingerprint", color: "emerald",
    price: 0.10, supportedChains: ["Off-chain"], estimatedTime: "~2s",
    description: "Creates a salted SHA-256 cryptographic commitment to your data — proves integrity without storing the raw payload. Honestly labeled: not a zero-knowledge proof circuit.",
    longDescription: "Generate a proof_id and shareable verification URL. Anyone with the original data can confirm it matches the commitment; plaintext is never persisted.",
    features: ["SHA-256 salted commitment", "No raw data stored", "Shareable proof URL", "Public verify page"],
    inputs: [{
      key: "cpdv_data",
      type: "text",
      label: "Data to commit",
      placeholder: "Paste sensitive text or JSON payload…",
      example: "customer-record-8842:status=verified",
      multiline: true,
    }],
    validator: "cpdvData", executor: execPrivateDataVerification, marketplaceVisible: true,
  },
  {
    id: "quantum-cryptography-verification", name: "Encrypted Data Vault", category: "Crypto", icon: "KeyRound", color: "cyan",
    price: 0.10, supportedChains: ["Off-chain"], estimatedTime: "~2s",
    description: "Encrypts your payload with AES-256-GCM and stores ciphertext keyed to your wallet — high-grade symmetric encryption, explicitly not post-quantum or quantum-resistant.",
    longDescription: "Owner-only retrieval via authenticated decrypt API. Uses Node.js crypto AES-256-GCM — suitable for demos, not quantum-threat models.",
    features: ["AES-256-GCM encryption", "Wallet-scoped storage", "Authenticated decrypt", "Honest crypto labeling"],
    inputs: [{
      key: "cqcv_data",
      type: "text",
      label: "Data to encrypt",
      placeholder: "Paste text to encrypt…",
      example: "confidential-api-key-rotation-schedule-2026",
      multiline: true,
    }],
    validator: "cqcvData", executor: execQuantumCryptographyVerification, marketplaceVisible: true,
  },
];

const VALIDATORS = {
  solanaToken: validateSolanaToken,
  solanaWallet: validateSolanaWallet,
  url: validateUrl,
  query: validateQuery,
  openClawConfig: validateOpenClawConfig,
  cpdvData: validateCpdvData,
  cqcvData: validateCqcvData,
};

export function getAgent(id) { return AGENTS.find((a) => a.id === id) || null; }
export function listAgents() { return AGENTS.map(({ executor, validator, ...rest }) => rest); }
export function listMarketplaceAgents() { return listAgents().filter((a) => a.marketplaceVisible !== false); }
export async function runAgent(agentId, inputs, context = {}) {
  const agent = getAgent(agentId);
  if (!agent) return { error: "Unknown agent" };
  const v = VALIDATORS[agent.validator](inputs);
  if (v.error) return { error: v.error };
  try {
    const result = await agent.executor(v, context);
    return { result };
  } catch (e) { return { error: e?.message || "Agent execution failed" }; }
}
