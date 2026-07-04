import OpenAI from "openai";

export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://solguard.ai",
    "X-Title": "SolGuard AI",
  },
});

const SYSTEM_PROMPT = `You are an elite Solana security auditor writing a single-sentence verdict for a token scan.

RULES:
- Write EXACTLY ONE complete sentence ending with a period
- Reference specific numbers from the data (wallet counts, holder %, authority status, liquidity USD)
- Plain English for non-technical readers — no jargon without explanation
- Be direct: state the bottom-line risk clearly
- Do NOT start with "Based on", "Here is", or "This token"
- Do NOT use asterisks, markdown, or bullet points
- Do NOT truncate mid-sentence — finish the full thought`;

function logOpenRouterError(context, e, extra = {}) {
  const status = e?.status ?? e?.code ?? extra.status ?? "unknown";
  console.error(`[OpenRouter] ${context} failed:`, {
    status,
    message: e?.message || extra.message || "unknown error",
    model: OPENROUTER_MODEL,
    ...extra,
  });
}

async function requestCompletion(messages, maxTokens, temperature) {
  return client.chat.completions.create({
    model: OPENROUTER_MODEL,
    max_tokens: maxTokens,
    temperature,
    messages,
  });
}

/** Trim incomplete trailing fragment; prefer last full sentence. */
export function ensureCompleteSentence(text) {
  if (!text) return text;
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (/[.!?]["']?$/.test(trimmed)) return trimmed;
  const punct = Math.max(
    trimmed.lastIndexOf(". "),
    trimmed.lastIndexOf("! "),
    trimmed.lastIndexOf("? ")
  );
  if (punct > 20) return trimmed.slice(0, punct + 1).trim();
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

/**
 * @returns {{ text: string|null, verdict: string|null, aiAvailable: boolean, reason: string|null }}
 */
export async function generateRiskSummary(scan) {
  const user = `Token: ${scan.tokenAddress}
Risk Score: ${scan.riskScore}/100 (${scan.riskLevel})
Freeze Authority: ${scan.authorityCheck.freezeAuthority}
Mint Authority: ${scan.authorityCheck.mintAuthority}
Bundle Detected: ${scan.bundleDetection.detected} — ${scan.bundleDetection.walletCount} wallets clustered
Top Holder: ${scan.bundleDetection.holderDataAvailable ? scan.bundleDetection.topHolderPercent.toFixed(1) + "%" : "Unable to verify"}
Top 10 Holders: ${scan.bundleDetection.holderDataAvailable ? scan.bundleDetection.top10Percent.toFixed(1) + "%" : "Unable to verify"}
Liquidity Pool Found: ${scan.liquidityLock.poolFound}
Liquidity USD: ${scan.liquidityLock.liquidityUsd ?? "unknown"}
Risk Factors: ${scan.riskFactors.join("; ")}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const maxTokens = attempt === 1 ? 400 : 600;
      const completion = await requestCompletion(messages, maxTokens, 0.5);
      const raw = completion.choices?.[0]?.message?.content?.trim();
      const finishReason = completion.choices?.[0]?.finish_reason;
      if (raw) {
        let text = ensureCompleteSentence(raw);
        if (finishReason === "length" && attempt < 2) {
          console.warn("[OpenRouter] generateRiskSummary hit token limit, retrying with higher max_tokens");
          continue;
        }
        if (attempt > 1) console.log("[OpenRouter] generateRiskSummary succeeded on retry");
        return { text, verdict: text, aiAvailable: true, reason: null };
      }
      lastError = { message: "Empty choices in response", status: 200 };
    } catch (e) {
      lastError = e;
      logOpenRouterError("generateRiskSummary", e, { attempt });
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
    }
  }

  logOpenRouterError("generateRiskSummary", lastError, { final: true });
  const reason = lastError?.message?.slice(0, 120) || "request_failed";
  return { text: null, verdict: null, aiAvailable: false, reason };
}
