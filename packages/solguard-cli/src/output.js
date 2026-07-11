const LEVEL_COLOR = {
  LOW: "\x1b[32m",
  MEDIUM: "\x1b[33m",
  HIGH: "\x1b[91m",
  CRITICAL: "\x1b[31m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function countElevated(findings = []) {
  let elevated = 0;
  for (const f of findings) {
    const imp = (f.impact || "").toLowerCase();
    if (imp.includes("+") && imp.includes("risk")) elevated++;
  }
  return elevated;
}

/** Build report text for terminal (also used after clack spinner so output isn't cleared). */
export function formatReport(result, { creditsRemaining, mode } = {}) {
  const r = result.result || result;
  const level = r.riskLevel || "LOW";
  const score = r.riskScore ?? "—";
  const lines = [];

  lines.push("━━━ SolGuard Report ━━━");
  if (mode) lines.push(`Mode: ${mode}`);
  lines.push(`RISK: ${level} (${score}/100)`);
  lines.push("");

  const fullResponse = r.rawEvidence?.fullResponse || r.evidence?.fullResponse;
  const verdict = r.verdict || r.summary || "";

  if (fullResponse) {
    lines.push("RESPONSE");
    lines.push(fullResponse.trim());
    lines.push("");
  } else if (verdict) {
    lines.push("VERDICT");
    lines.push(verdict.trim());
    lines.push("");
  }

  const findings = r.keyFindings || [];
  if (findings.length) {
    const elevated = countElevated(findings);
    lines.push(`KEY FINDINGS (${findings.length} checked${elevated ? `, ${elevated} elevated` : ""})`);
    for (const f of findings.slice(0, 8)) {
      const flag = (f.impact || "").includes("+") ? "!" : "·";
      lines.push(`  ${flag} ${f.label}: ${f.value}`);
    }
    if (findings.length > 8) lines.push(`  … and ${findings.length - 8} more`);
    lines.push("");
  }

  if (r.recommendations?.length) {
    lines.push("RECOMMENDATIONS");
    for (const rec of r.recommendations.slice(0, 5)) {
      lines.push(`  → ${rec}`);
    }
    lines.push("");
  }

  if (creditsRemaining != null) {
    lines.push(`Credits remaining: ${creditsRemaining}`);
  }

  return lines.join("\n");
}

export function printReport(result, opts = {}) {
  const text = formatReport(result, opts);
  console.log("");
  console.log(text);
  console.log("");
}

export function reportFilename() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `solguard-report-${ts}.json`;
}
