import { Connection, PublicKey } from "@solana/web3.js";
import { normalizeRiskScore } from "./reportBuilder.js";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

let _conn = null;
function getConnection() {
  if (!_conn) _conn = new Connection(RPC_URL, "confirmed");
  return _conn;
}

export function isValidSolanaAddress(address) {
  return typeof address === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

async function fetchAsset(mintAddress) {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "solguard",
        method: "getAsset",
        params: { id: mintAddress },
      }),
    });
    const j = await res.json();
    return j?.result || null;
  } catch (e) {
    return null;
  }
}

async function checkAuthorities(connection, mintPubkey) {
  const info = await connection.getParsedAccountInfo(mintPubkey);
  const parsed = info?.value?.data?.parsed;
  if (!parsed || parsed.type !== "mint") {
    throw new Error("Address is not a valid SPL token mint");
  }
  const inf = parsed.info;
  const mintAuth = inf.mintAuthority || null;
  const freezeAuth = inf.freezeAuthority || null;
  const decimals = inf.decimals;
  const supplyRaw = inf.supply;

  const riskFlags = [];
  if (mintAuth) riskFlags.push("Mint authority not revoked — developer can mint unlimited new tokens.");
  if (freezeAuth) riskFlags.push("Freeze authority active — developer can freeze any holder wallet.");

  return {
    mintAuthority: mintAuth ? "ACTIVE" : "REVOKED",
    freezeAuthority: freezeAuth ? "ACTIVE" : "REVOKED",
    mintAuthorityAddress: mintAuth,
    freezeAuthorityAddress: freezeAuth,
    decimals,
    supplyRaw,
    riskFlags,
  };
}

async function fetchHolderConcentration(connection, mintPubkey, supplyBig) {
  const MAX_ATTEMPTS = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const largest = await connection.getTokenLargestAccounts(mintPubkey);
      const accounts = largest?.value || [];
      if (accounts.length > 0 && supplyBig > 0n) {
        const topRaw = BigInt(accounts[0]?.amount || "0");
        let sum10 = 0n;
        for (const a of accounts.slice(0, 10)) sum10 += BigInt(a.amount || "0");
        const topHolderPercent = Number((topRaw * 10000n) / supplyBig) / 100;
        const top10Percent = Number((sum10 * 10000n) / supplyBig) / 100;
        if (attempt > 1) {
          console.log(`[scanEngine] getTokenLargestAccounts succeeded on attempt ${attempt} for ${mintPubkey.toBase58()}`);
        }
        return {
          topHolderPercent,
          top10Percent,
          holderDataAvailable: true,
          holderDataError: null,
          topAccountsSampled: accounts.length,
        };
      }
      lastError = "getTokenLargestAccounts returned no accounts";
    } catch (e) {
      lastError = e?.message || "getTokenLargestAccounts failed";
      console.warn(`[scanEngine] getTokenLargestAccounts attempt ${attempt}/${MAX_ATTEMPTS} failed for ${mintPubkey.toBase58()}: ${lastError}`);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  console.error(`[scanEngine] Holder concentration unavailable for ${mintPubkey.toBase58()}: ${lastError}`);
  return {
    topHolderPercent: null,
    top10Percent: null,
    holderDataAvailable: false,
    holderDataError: lastError,
    topAccountsSampled: 0,
  };
}

async function detectBundle(connection, mintPubkey) {
  const riskFlags = [];
  let suspiciousWalletCount = 0;
  let earlySlotClustering = false;

  let supplyBig = 0n;
  let totalSupply = 0;
  try {
    const supplyRes = await connection.getTokenSupply(mintPubkey);
    supplyBig = BigInt(supplyRes?.value?.amount || "0");
    totalSupply = Number(supplyRes?.value?.uiAmountString || supplyRes?.value?.uiAmount || 0);
  } catch (e) {
    console.warn(`[scanEngine] getTokenSupply failed for ${mintPubkey.toBase58()}:`, e?.message);
  }

  const holder = supplyBig > 0n
    ? await fetchHolderConcentration(connection, mintPubkey, supplyBig)
    : {
        topHolderPercent: null,
        top10Percent: null,
        holderDataAvailable: false,
        holderDataError: supplyBig > 0n ? null : "Token supply unavailable",
        topAccountsSampled: 0,
      };

  const topHolderPercent = holder.topHolderPercent;
  const top10Percent = holder.top10Percent;

  try {
    const sigs = await connection.getSignaturesForAddress(mintPubkey, { limit: 200 });
    const bySlot = {};
    for (const s of sigs) {
      bySlot[s.slot] = (bySlot[s.slot] || 0) + 1;
    }
    const clusteredSlots = Object.entries(bySlot).filter(([, n]) => n >= 5);
    if (clusteredSlots.length >= 1) {
      earlySlotClustering = true;
      suspiciousWalletCount = clusteredSlots.reduce((s, [, n]) => s + n, 0);
    }
  } catch (e) {
    console.warn(`[scanEngine] signature clustering failed for ${mintPubkey.toBase58()}:`, e?.message);
  }

  const supplyPercent = holder.holderDataAvailable ? top10Percent : null;

  if (holder.holderDataAvailable && topHolderPercent > 20) {
    riskFlags.push(`Top wallet holds ${topHolderPercent.toFixed(1)}% of total supply.`);
  }
  if (holder.holderDataAvailable && top10Percent > 50) {
    riskFlags.push(`Top 10 wallets control ${top10Percent.toFixed(1)}% of supply — high concentration risk.`);
  }
  if (!holder.holderDataAvailable) {
    riskFlags.push(`Holder concentration unverified — ${holder.holderDataError || "RPC could not return largest accounts"}.`);
  }
  if (earlySlotClustering) riskFlags.push("Suspicious transaction clustering detected — possible coordinated bundle/snipe.");

  return {
    detected: earlySlotClustering || (holder.holderDataAvailable && top10Percent > 50),
    walletCount: suspiciousWalletCount,
    supplyPercent,
    topHolderPercent,
    top10Percent,
    holderDataAvailable: holder.holderDataAvailable,
    holderDataError: holder.holderDataError,
    topAccountsSampled: holder.topAccountsSampled,
    earlySlotClustering,
    riskFlags,
    totalSupply,
  };
}

async function verifyLiquidityLock(connection, mintAddress, asset) {
  const riskFlags = [];
  // MVP heuristic: rely on Helius asset data if available
  // Real LP burn checking requires Raydium pool lookup which is complex; gracefully fallback
  let poolFound = false;
  let lpBurned = false;
  let burnPercent = 0;
  let liquidityUsd = null;

  // Try DexScreener as fallback for liquidity info
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      const pairs = j?.pairs || [];
      if (pairs.length > 0) {
        poolFound = true;
        // pick most liquid pair
        pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        liquidityUsd = pairs[0]?.liquidity?.usd || 0;
        if (liquidityUsd < 10000) {
          riskFlags.push(`Low liquidity pool (~$${Math.round(liquidityUsd).toLocaleString()}) — high slippage and exit risk.`);
        }
      }
    }
  } catch (e) {}

  if (!poolFound) {
    riskFlags.push("No active DEX liquidity pool detected for this token.");
  } else {
    // We cannot easily check LP burn on-chain in MVP; flag as unverified rather than false alarm
    riskFlags.push("LP burn status unverified — manually check Raydium/Orca pool for burned LP tokens.");
  }

  return { poolFound, lpBurned, burnPercent, liquidityUsd, riskFlags };
}

function calculateRiskScore(authority, bundle, liquidity) {
  let score = 0;
  if (authority.freezeAuthority === "ACTIVE") score += 30;
  if (authority.mintAuthority === "ACTIVE") score += 20;
  if (bundle.detected) score += 25;
  if (bundle.holderDataAvailable) {
    if (bundle.topHolderPercent > 20) score += 10;
    if (bundle.topHolderPercent > 50) score += 15;
    if (bundle.top10Percent > 70) score += 10;
  }
  if (liquidity.poolFound && liquidity.liquidityUsd !== null && liquidity.liquidityUsd < 10000) score += 15;
  if (!liquidity.poolFound) score += 5;

  const allFlags = [
    ...(authority.riskFlags || []),
    ...(bundle.riskFlags || []),
    ...(liquidity.riskFlags || []),
  ];
  score = Math.min(100, score);

  let level = "LOW";
  if (score >= 76) level = "CRITICAL";
  else if (score >= 51) level = "HIGH";
  else if (score >= 26) level = "MEDIUM";

  return { score, level, factors: allFlags };
}

export async function runTokenScan(mintAddress) {
  if (!isValidSolanaAddress(mintAddress)) {
    throw new Error("Invalid Solana token address format.");
  }
  const connection = getConnection();
  const mintPubkey = new PublicKey(mintAddress);

  const [authority, bundle, asset] = await Promise.all([
    checkAuthorities(connection, mintPubkey),
    detectBundle(connection, mintPubkey),
    fetchAsset(mintAddress),
  ]);
  const liquidity = await verifyLiquidityLock(connection, mintAddress, asset);

  const meta = asset?.content?.metadata || {};
  const tokenInfo = asset?.token_info || {};
  const metadata = {
    name: meta.name || tokenInfo.symbol || null,
    symbol: meta.symbol || tokenInfo.symbol || null,
    decimals: tokenInfo.decimals ?? authority.decimals,
    image: asset?.content?.links?.image || asset?.content?.files?.[0]?.uri || null,
    description: meta.description || null,
    totalSupply: authority.supplyRaw,
    mintAddress,
  };

  const { score, level, factors } = calculateRiskScore(authority, bundle, liquidity);

  return {
    tokenAddress: mintAddress,
    metadata,
    authorityCheck: authority,
    bundleDetection: bundle,
    liquidityLock: liquidity,
    riskScore: normalizeRiskScore(score),
    riskLevel: level,
    riskFactors: factors,
    scannedAt: new Date().toISOString(),
  };
}
