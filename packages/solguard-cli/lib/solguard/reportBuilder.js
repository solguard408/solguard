/** Never surface 0 in UI/API — floor at 2 so "zero risk" reads as a small positive score. */
export const MIN_RISK_SCORE = 2;

export function normalizeRiskScore(score) {
  const n = Math.round(Number(score));
  if (!Number.isFinite(n) || n <= 0) return MIN_RISK_SCORE;
  return Math.min(100, n);
}

/** Standard agent report envelope — keeps legacy `summary` / `evidence` aliases. */
export function buildReport({
  agentId,
  input,
  riskScore,
  riskLevel,
  verdict,
  keyFindings = [],
  recommendations = [],
  confidence,
  dataSource = [],
  rawEvidence = {},
  scannedAt = new Date().toISOString(),
  ai_summary_available,
  ai_summary_reason,
}) {
  const report = {
    agentId,
    input,
    riskScore: normalizeRiskScore(riskScore),
    riskLevel,
    scannedAt,
    dataSource,
    verdict,
    summary: verdict,
    keyFindings,
    recommendations,
    confidence,
    rawEvidence,
    evidence: rawEvidence,
  };
  if (ai_summary_available !== undefined) {
    report.ai_summary_available = ai_summary_available;
    report.ai_summary_reason = ai_summary_reason ?? null;
  }
  return report;
}

export function finding(label, value, impact, explanation) {
  return { label, value, impact, explanation };
}

export function impactFromScore(delta) {
  if (delta === 0) return "neutral";
  return delta > 0 ? `+${delta} risk` : `${delta} risk`;
}

export function formatSol(lamports) {
  const n = Number(lamports) / 1e9;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M SOL`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K SOL`;
  if (n >= 1) return `${n.toFixed(4)} SOL`;
  return `${n.toFixed(6)} SOL`;
}

/** Build a holder-concentration finding; never reports 0% when data was unavailable. */
export function holderConcentrationFinding(label, bundle, { highThreshold = 20, top10Threshold = 50, isTop10 = false } = {}) {
  const available = bundle.holderDataAvailable === true;
  const pct = isTop10 ? bundle.top10Percent : bundle.topHolderPercent;
  if (!available) {
    return finding(
      label,
      "Unable to verify",
      "unknown",
      bundle.holderDataError
        ? `Holder data could not be fetched (${bundle.holderDataError}) — zero concentration must not be assumed.`
        : "Holder concentration could not be verified on-chain — do not assume zero concentration."
    );
  }
  const threshold = isTop10 ? top10Threshold : highThreshold;
  const impact = pct > threshold ? `+${isTop10 ? 25 : 10} risk` : "neutral";
  const explanation = isTop10
    ? (pct > threshold
      ? "A small group could coordinate a mass sell-off."
      : "Supply is spread across many holders rather than a tight cluster.")
    : (pct > threshold
      ? "A single wallet controls a large share, increasing dump risk."
      : "No single wallet dominates supply, which supports healthier distribution.");
  return finding(label, `${pct.toFixed(1)}%`, impact, explanation);
}

export function holderShareLabel(bundle, isTop10 = false) {
  if (bundle.holderDataAvailable !== true) return "Unable to verify";
  const pct = isTop10 ? bundle.top10Percent : bundle.topHolderPercent;
  return `${pct.toFixed(1)}%`;
}

/** Deterministic one-sentence verdict when AI output is missing or invalid. */
export function buildOnChainVerdict(scan) {
  const flag = scan.riskFactors?.length
    ? scan.riskFactors[0].replace(/\.\s*$/, "")
    : "no major red flags detected";
  const top10 = holderShareLabel(scan.bundleDetection, true);
  const score = normalizeRiskScore(scan.riskScore);
  return `This token scores ${score}/100 (${scan.riskLevel}) with mint authority ${scan.authorityCheck.mintAuthority.toLowerCase()}, freeze authority ${scan.authorityCheck.freezeAuthority.toLowerCase()}, and top 10 holders at ${top10} — ${flag}.`;
}
