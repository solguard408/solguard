import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://solguard.ai",
    "X-Title": "SolGuard AI",
  }
});

const SYSTEM_PROMPT = `You are an elite Solana security auditor with zero tolerance for rug pulls and scam tokens.
Analyze the provided token security data and write a single paragraph risk assessment.

RULES:
- Maximum 3 sentences
- Be direct and blunt — no corporate language
- If risk is HIGH or CRITICAL: open with a clear danger warning
- If risk is LOW: confirm it appears safe but note any minor concerns
- Reference specific numbers (freeze authority status, bundle %, top holder %)
- End with a clear recommendation: AVOID / PROCEED WITH CAUTION / APPEARS SAFE
- Do NOT start with "Based on", "Here is", or "This token"
- Do NOT use asterisks or formatting
- Write for a crypto trader reading on their phone`;

export async function generateRiskSummary(scan) {
  const user = `Token: ${scan.tokenAddress}
Risk Score: ${scan.riskScore}/100 (${scan.riskLevel})
Freeze Authority: ${scan.authorityCheck.freezeAuthority}
Mint Authority: ${scan.authorityCheck.mintAuthority}
Bundle Detected: ${scan.bundleDetection.detected} — ${scan.bundleDetection.walletCount} wallets clustered
Top Holder: ${scan.bundleDetection.topHolderPercent.toFixed(1)}%
Top 10 Holders: ${scan.bundleDetection.top10Percent.toFixed(1)}%
Liquidity Pool Found: ${scan.liquidityLock.poolFound}
Liquidity USD: ${scan.liquidityLock.liquidityUsd ?? "unknown"}
Risk Factors: ${scan.riskFactors.join("; ")}`;

  try {
    const completion = await client.chat.completions.create({
      model: "google/gemini-2.5-flash",
      max_tokens: 220,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    });
    return completion.choices?.[0]?.message?.content?.trim() || "AI analysis temporarily unavailable.";
  } catch (e) {
    console.error("AI summary error:", e?.message);
    return "AI analysis temporarily unavailable.";
  }
}
