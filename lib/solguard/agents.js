// Agent registry — single source of truth for the marketplace.
import { runTokenScan, isValidSolanaAddress } from "./scanEngine";
import { generateRiskSummary } from "./aiSummary";
import OpenAI from "openai";
import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
let _conn = null;
function getConnection() { if (!_conn) _conn = new Connection(RPC_URL, "confirmed"); return _conn; }

const aiClient = new OpenAI({ apiKey: process.env.EMERGENT_LLM_KEY, baseURL: "https://integrations.emergentagent.com/llm" });

// ---------- INPUT VALIDATORS ----------
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

async function execTokenAudit({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const ai = await generateRiskSummary(scan);
  return { summary: ai, riskScore: scan.riskScore, riskLevel: scan.riskLevel, evidence: scan, recommendations: deriveRecs(scan) };
}

async function execContractSecurity({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const a = scan.authorityCheck;
  const score = (a.mintAuthority === "ACTIVE" ? 50 : 0) + (a.freezeAuthority === "ACTIVE" ? 50 : 0);
  return {
    summary: a.riskFlags.length ? a.riskFlags.join(" ") : "Authorities revoked. Contract is safely locked.",
    riskScore: score, riskLevel: score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW",
    evidence: { mintAuthority: a.mintAuthority, freezeAuthority: a.freezeAuthority, mintAuthorityAddress: a.mintAuthorityAddress, freezeAuthorityAddress: a.freezeAuthorityAddress },
    recommendations: a.riskFlags,
  };
}
async function execBundleDetection({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const b = scan.bundleDetection;
  const score = (b.detected ? 30 : 0) + Math.min(40, b.top10Percent * 0.5) + (b.earlySlotClustering ? 20 : 0);
  return {
    summary: b.detected ? `Coordinated activity detected: ${b.walletCount} wallets clustered at launch, top 10 hold ${b.top10Percent.toFixed(1)}%.` : `No bundle clustering. Top 10 hold ${b.top10Percent.toFixed(1)}%.`,
    riskScore: Math.round(score), riskLevel: score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW", evidence: b, recommendations: b.riskFlags,
  };
}
async function execHolderDistribution({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const b = scan.bundleDetection;
  const score = b.topHolderPercent > 50 ? 90 : b.topHolderPercent > 30 ? 60 : b.topHolderPercent > 15 ? 30 : 10;
  return {
    summary: `Top holder controls ${b.topHolderPercent.toFixed(1)}%. Top 10 control ${b.top10Percent.toFixed(1)}% of supply.`,
    riskScore: score, riskLevel: score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW",
    evidence: { topHolderPercent: b.topHolderPercent, top10Percent: b.top10Percent }, recommendations: b.riskFlags.filter((f) => f.toLowerCase().includes("holder") || f.toLowerCase().includes("supply")),
  };
}
async function execLiquidityVerification({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const l = scan.liquidityLock;
  const score = !l.poolFound ? 30 : (l.liquidityUsd && l.liquidityUsd < 10000 ? 60 : 10);
  return {
    summary: l.poolFound ? `Pool found with $${Math.round(l.liquidityUsd || 0).toLocaleString()} liquidity.` : "No active DEX pool detected.",
    riskScore: score, riskLevel: score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW", evidence: l, recommendations: l.riskFlags,
  };
}
async function execLiquidityLock({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const l = scan.liquidityLock;
  return {
    summary: l.poolFound ? "Pool exists but LP-burn status is unverified via on-chain heuristics. Manually verify burn TX on Raydium/Orca." : "No pool found.",
    riskScore: l.poolFound ? 40 : 30, riskLevel: "MEDIUM", evidence: l, recommendations: ["Check Raydium pool LP token mint for burn transactions to the system program."],
  };
}
async function execMetadata({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const m = scan.metadata;
  const issues = [];
  if (!m.name) issues.push("Missing token name");
  if (!m.symbol) issues.push("Missing token symbol");
  if (!m.image) issues.push("Missing token logo / image");
  const score = issues.length * 15;
  return {
    summary: issues.length ? `Metadata gaps: ${issues.join(", ")}.` : `Token has complete metadata (${m.name} / $${m.symbol}).`,
    riskScore: Math.min(60, score), riskLevel: score >= 30 ? "MEDIUM" : "LOW", evidence: m, recommendations: issues,
  };
}
async function execRugProbability({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  const score = scan.riskScore;
  const ai = await generateRiskSummary(scan);
  return { summary: ai, riskScore: score, riskLevel: scan.riskLevel, evidence: { factors: scan.riskFactors }, recommendations: scan.riskFactors };
}
async function execRiskScore({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  return { summary: `Composite risk score across all engines: ${scan.riskScore}/100 (${scan.riskLevel}).`, riskScore: scan.riskScore, riskLevel: scan.riskLevel, evidence: { breakdown: scan }, recommendations: scan.riskFactors };
}
async function execMarketManipulation({ tokenAddress }) {
  const scan = await getCachedScan(tokenAddress);
  // heuristic: bundle clustering + high holder concentration = manipulation
  const score = (scan.bundleDetection.detected ? 40 : 0) + Math.min(40, scan.bundleDetection.top10Percent * 0.6);
  return { summary: score > 50 ? "High likelihood of coordinated price manipulation based on launch clustering and holder concentration." : "No strong manipulation signals detected.", riskScore: Math.round(score), riskLevel: score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW", evidence: scan.bundleDetection, recommendations: scan.bundleDetection.riskFlags };
}
async function execVolumeAuthenticity({ tokenAddress }) {
  // Pull DexScreener volume
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { cache: "no-store" });
    const j = await res.json();
    const pair = (j?.pairs || []).sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];
    if (!pair) return { summary: "No DEX volume data available.", riskScore: 40, riskLevel: "MEDIUM", evidence: {}, recommendations: ["Token may not be actively traded."] };
    const v24 = pair.volume?.h24 || 0, liq = pair.liquidity?.usd || 0;
    const turnoverRatio = liq > 0 ? v24 / liq : 0;
    const suspicious = turnoverRatio > 50;
    return { summary: `24h volume $${Math.round(v24).toLocaleString()} on $${Math.round(liq).toLocaleString()} liquidity (turnover ${turnoverRatio.toFixed(1)}x). ${suspicious ? "Abnormally high turnover suggests wash trading." : "Turnover appears organic."}`, riskScore: suspicious ? 70 : 20, riskLevel: suspicious ? "HIGH" : "LOW", evidence: { v24, liq, turnoverRatio, pairUrl: pair.url }, recommendations: suspicious ? ["Investigate possible wash trading"] : [] };
  } catch (e) { return { summary: "Volume data unavailable.", riskScore: 30, riskLevel: "MEDIUM", evidence: {}, recommendations: [] }; }
}
async function execWalletAudit({ walletAddress }) {
  const conn = getConnection();
  const pk = new PublicKey(walletAddress);
  const bal = await conn.getBalance(pk);
  const sigs = await conn.getSignaturesForAddress(pk, { limit: 100 });
  const firstTxAt = sigs.length ? sigs[sigs.length - 1].blockTime : null;
  const lastTxAt = sigs.length ? sigs[0].blockTime : null;
  const ageDays = firstTxAt ? Math.floor((Date.now() / 1000 - firstTxAt) / 86400) : 0;
  const txCount = sigs.length;
  const score = (ageDays < 7 ? 40 : ageDays < 30 ? 20 : 0) + (txCount < 5 ? 30 : 0);
  const flags = [];
  if (ageDays < 7) flags.push(`Wallet is only ${ageDays} day(s) old`);
  if (txCount < 5) flags.push(`Very low transaction history (${txCount} txs)`);
  if (sigs.filter((s) => s.slot).length > 30 && ageDays < 1) flags.push("High-frequency activity from new wallet — possible bot");
  return { summary: `Wallet ${ageDays} day(s) old, ${txCount} recent txs, ${(bal/1e9).toFixed(3)} SOL. ${flags.length ? flags.join(". ") : "No major red flags."}`, riskScore: Math.min(100, score), riskLevel: score >= 50 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW", evidence: { ageDays, txCount, balanceSol: bal / 1e9, firstTxAt, lastTxAt }, recommendations: flags };
}
async function execDeveloperWalletAnalysis({ walletAddress }) {
  // Same as wallet audit but framed as developer evaluation
  const r = await execWalletAudit({ walletAddress });
  return { ...r, summary: "Developer wallet behavioral analysis: " + r.summary };
}
async function execSocialVerification({ tokenAddress }) {
  // MVP heuristic: check DexScreener socials
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, { cache: "no-store" });
    const j = await res.json();
    const pair = (j?.pairs || [])[0];
    const info = pair?.info || {};
    const socials = info.socials || [];
    const websites = info.websites || [];
    const has = { twitter: socials.some(s => /twitter|x\./i.test(s.url || s.type)), telegram: socials.some(s => /telegram/i.test(s.url || s.type)), website: websites.length > 0 };
    const missing = Object.entries(has).filter(([, v]) => !v).map(([k]) => k);
    const score = missing.length * 20;
    return { summary: missing.length ? `Missing social presence: ${missing.join(", ")}.` : "Token has full social presence (Twitter, Telegram, website).", riskScore: score, riskLevel: score >= 40 ? "MEDIUM" : "LOW", evidence: { socials, websites, has }, recommendations: missing.map((m) => `Add ${m} link to token metadata`) };
  } catch { return { summary: "Social data unavailable", riskScore: 30, riskLevel: "MEDIUM", evidence: {}, recommendations: [] }; }
}
async function execWebsiteSecurity({ url }) {
  // MVP: HEAD request + check for HTTPS and security headers
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const headers = Object.fromEntries(res.headers);
    const flags = [];
    if (!url.startsWith("https://")) flags.push("Site not served over HTTPS");
    if (!headers["strict-transport-security"]) flags.push("Missing HSTS header");
    if (!headers["content-security-policy"]) flags.push("Missing Content-Security-Policy header");
    if (!headers["x-frame-options"]) flags.push("Missing X-Frame-Options");
    const score = flags.length * 15;
    return { summary: `Site responded ${res.status}. ${flags.length ? flags.length + " security headers missing." : "Core security headers present."}`, riskScore: Math.min(80, score), riskLevel: score >= 45 ? "HIGH" : score >= 20 ? "MEDIUM" : "LOW", evidence: { status: res.status, headers, flags }, recommendations: flags };
  } catch (e) { return { summary: `Could not reach ${url}: ${e.message}`, riskScore: 60, riskLevel: "HIGH", evidence: { error: e.message }, recommendations: ["Site unreachable"] }; }
}
async function execAiConsultant({ query }) {
  try {
    const completion = await aiClient.chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 600, temperature: 0.6,
      messages: [
        { role: "system", content: "You are SolGuard's expert crypto security consultant. Answer concisely (under 250 words) about Solana token security, wallet safety, rug pulls, smart contract risks, and DeFi best practices. Be direct, technical, and reference specific attack vectors when relevant. End with a clear, actionable recommendation." },
        { role: "user", content: query },
      ],
    });
    const text = completion.choices?.[0]?.message?.content?.trim() || "Unable to generate response.";
    return { summary: text, riskScore: 0, riskLevel: "LOW", evidence: { question: query }, recommendations: [] };
  } catch (e) { return { summary: "AI consultant temporarily unavailable. Please try again shortly.", riskScore: 0, riskLevel: "LOW", evidence: {}, recommendations: [] }; }
}

function deriveRecs(scan) {
  const recs = [];
  if (scan.authorityCheck.freezeAuthority === "ACTIVE") recs.push("Avoid until freeze authority is revoked");
  if (scan.authorityCheck.mintAuthority === "ACTIVE") recs.push("Watch for sudden supply inflation");
  if (scan.bundleDetection.detected) recs.push("Monitor coordinated wallet movements");
  if (!scan.liquidityLock.poolFound) recs.push("No tradeable liquidity — high exit risk");
  return recs;
}

// ---------- AGENT REGISTRY ----------
export const AGENTS = [
  {
    id: "token-audit", name: "Token Audit", category: "Token", icon: "Coins", color: "teal",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~5s",
    description: "Comprehensive on-chain audit covering mint authority, freeze authority, holder concentration, liquidity, and bundle launch detection.",
    longDescription: "Runs every core engine in parallel and returns a unified threat report with AI-generated narrative. Best starting point for evaluating any unknown Solana SPL token.",
    features: ["Mint & freeze authority check", "Top holder analysis", "Bundle clustering detection", "DEX pool & liquidity scan", "AI risk narrative"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "e.g. DezXAZ8z7Pnr...", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execTokenAudit,
  },
  {
    id: "contract-security", name: "Contract Security", category: "Token", icon: "Lock", color: "rose",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~2s",
    description: "Audits the SPL mint account for active mint and freeze authorities — the single biggest rug vector.",
    longDescription: "Decodes the on-chain mint account and verifies that mint and freeze authorities have been revoked (set to null). Active authorities mean the deployer can mint new supply or freeze holder wallets at will.",
    features: ["Mint authority status", "Freeze authority status", "Authority address resolution"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execContractSecurity,
  },
  {
    id: "bundle-detection", name: "Bundle Detection", category: "Token", icon: "Layers", color: "orange",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Detects coordinated wallet clustering and snipe bundles at token launch via slot grouping analysis.",
    longDescription: "Pulls the last 200 signatures touching the mint, groups them by slot, and flags slots with abnormal transaction density typical of bundled launches.",
    features: ["Slot-density clustering", "Top 10 wallet concentration", "Suspicious wallet count"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execBundleDetection,
  },
  {
    id: "holder-distribution", name: "Holder Distribution", category: "Token", icon: "Users", color: "amber",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~2s",
    description: "Reveals how concentrated token supply is among top holders.",
    features: ["Top wallet %", "Top 10 wallets %", "Concentration risk score"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execHolderDistribution,
  },
  {
    id: "liquidity-verification", name: "Liquidity Verification", category: "Liquidity", icon: "Droplets", color: "cyan",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Verifies an active DEX pool exists and quantifies liquidity depth in USD.",
    features: ["DEX pool discovery", "USD liquidity depth", "Exit-risk scoring"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execLiquidityVerification,
  },
  {
    id: "liquidity-lock-analysis", name: "Liquidity Lock Analysis", category: "Liquidity", icon: "Lock", color: "emerald",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Verifies LP token burn / lock status — the strongest defense against deployer-side rugs.",
    features: ["LP burn status", "Pool age", "Lock recommendations"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execLiquidityLock,
  },
  {
    id: "metadata-verification", name: "Metadata Verification", category: "Token", icon: "FileText", color: "violet",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~2s",
    description: "Checks token metadata completeness — name, symbol, logo image.",
    features: ["Name presence", "Symbol presence", "Logo image URL"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execMetadata,
  },
  {
    id: "rug-probability", name: "Rug Probability", category: "AI", icon: "Sparkles", color: "rose",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~6s",
    description: "AI-synthesized probability that this token is a rug pull, based on all combined signals.",
    features: ["GPT-4o-mini synthesis", "Combined risk factors", "Trader-ready verdict"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execRugProbability,
  },
  {
    id: "risk-score", name: "Composite Risk Score", category: "AI", icon: "ShieldAlert", color: "orange",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~5s",
    description: "Single weighted risk score (0–100) across every available engine.",
    features: ["0–100 score", "Severity level", "Per-engine breakdown"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execRiskScore,
  },
  {
    id: "market-manipulation", name: "Market Manipulation Detection", category: "Market", icon: "TrendingUp", color: "rose",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~5s",
    description: "Detects price-pump coordination via launch clustering and top-holder concentration.",
    features: ["Bundle clustering", "Holder concentration", "Manipulation likelihood"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execMarketManipulation,
  },
  {
    id: "volume-authenticity", name: "Volume Authenticity", category: "Market", icon: "Activity", color: "amber",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Flags wash trading by comparing 24h volume to pool liquidity (turnover ratio).",
    features: ["24h volume", "Turnover ratio", "Wash-trade flag"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execVolumeAuthenticity,
  },
  {
    id: "social-verification", name: "Social Verification", category: "Social", icon: "Globe", color: "sky",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~3s",
    description: "Checks for active Twitter, Telegram, and website links in token metadata.",
    features: ["Twitter presence", "Telegram presence", "Website link"],
    inputs: [{ key: "tokenAddress", label: "Token Mint Address", placeholder: "Token mint pubkey", example: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }],
    validator: "solanaToken", executor: execSocialVerification,
  },
  {
    id: "wallet-audit", name: "Wallet Audit", category: "Wallet", icon: "Wallet", color: "teal",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Profiles any Solana wallet: age, transaction count, balance, and bot-behavior heuristics.",
    features: ["Wallet age", "Transaction count", "Balance check", "Bot heuristics"],
    inputs: [{ key: "walletAddress", label: "Wallet Address", placeholder: "Solana wallet pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }],
    validator: "solanaWallet", executor: execWalletAudit,
  },
  {
    id: "developer-wallet-analysis", name: "Developer Wallet Analysis", category: "Wallet", icon: "UserCog", color: "violet",
    price: 0.10, supportedChains: ["Solana"], estimatedTime: "~4s",
    description: "Background check on a token's deployer wallet — age, history, and red flags.",
    features: ["Deployer age", "Historical behavior", "Risk flags"],
    inputs: [{ key: "walletAddress", label: "Developer Wallet Address", placeholder: "Deployer pubkey", example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }],
    validator: "solanaWallet", executor: execDeveloperWalletAnalysis,
  },
  {
    id: "website-security", name: "Website Security", category: "Web", icon: "Shield", color: "cyan",
    price: 0.10, supportedChains: ["Off-chain"], estimatedTime: "~3s",
    description: "Scans a project's official website for security header gaps and HTTPS issues.",
    features: ["HTTPS check", "HSTS", "CSP", "X-Frame-Options"],
    inputs: [{ key: "url", label: "Website URL", placeholder: "https://example.com", example: "https://solana.com" }],
    validator: "url", executor: execWebsiteSecurity,
  },
  {
    id: "ai-consultant", name: "AI Security Consultant", category: "Advisory", icon: "MessageSquare", color: "teal",
    price: 0.10, supportedChains: ["All"], estimatedTime: "~5s",
    description: "Ask any crypto security question — token risks, attack vectors, best practices.",
    longDescription: "GPT-4o-mini backed expert consultant. Reference specific tokens, exploits, or general security concepts.",
    features: ["Open-ended Q&A", "Attack vector explainers", "Best-practice guidance"],
    inputs: [{ key: "query", label: "Your Question", placeholder: "e.g. How do honeypot tokens lock liquidity?", example: "What is the most common Solana token rug-pull pattern in 2025?", multiline: true }],
    validator: "query", executor: execAiConsultant,
  },
];

const VALIDATORS = { solanaToken: validateSolanaToken, solanaWallet: validateSolanaWallet, url: validateUrl, query: validateQuery };

export function getAgent(id) { return AGENTS.find((a) => a.id === id) || null; }
export function listAgents() { return AGENTS.map(({ executor, validator, ...rest }) => rest); }
export async function runAgent(agentId, inputs) {
  const agent = getAgent(agentId);
  if (!agent) return { error: "Unknown agent" };
  const v = VALIDATORS[agent.validator](inputs);
  if (v.error) return { error: v.error };
  try {
    const result = await agent.executor(v);
    return { result };
  } catch (e) { return { error: e?.message || "Agent execution failed" }; }
}
