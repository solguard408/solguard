import OpenAI from "openai";
import { isInvalidAiVerdict, ensureCompleteSentence } from "./verdictValidation.js";

export { isInvalidAiVerdict, ensureCompleteSentence } from "./verdictValidation.js";

export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

let _client = null;
function getOpenRouterClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://www.solguard.space",
        "X-Title": "SolGuard AI",
      },
    });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are a Solana security auditor. Respond with ONLY one plain-English sentence (max 35 words) that states the bottom-line risk for this token.

Output rules:
- Exactly one sentence ending with a period
- Reference at least one specific number from the scan data
- No preamble, no bullet points, no markdown, no labels like "Risk Score:" or "Verdict:"
- Do not repeat the instructions or restate the raw data fields
- Do not start with "Based on", "Here is", or "This token"`;

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
  return getOpenRouterClient().chat.completions.create({
    model: OPENROUTER_MODEL,
    max_tokens: maxTokens,
    temperature,
    messages,
  });
}

function buildRiskSummaryMessages(scan) {
  const user = `Scan data:
Risk ${scan.riskScore}/100 (${scan.riskLevel})
Mint authority ${scan.authorityCheck.mintAuthority}, freeze authority ${scan.authorityCheck.freezeAuthority}
Bundle clustering ${scan.bundleDetection.detected ? `yes (${scan.bundleDetection.walletCount} wallets)` : "not detected"}
Top holder ${scan.bundleDetection.holderDataAvailable ? scan.bundleDetection.topHolderPercent.toFixed(1) + "%" : "unverified"}
Top 10 holders ${scan.bundleDetection.holderDataAvailable ? scan.bundleDetection.top10Percent.toFixed(1) + "%" : "unverified"}
DEX liquidity ${scan.liquidityLock.poolFound ? `$${Math.round(scan.liquidityLock.liquidityUsd || 0).toLocaleString("en-US")}` : "none found"}
Flags: ${scan.riskFactors.slice(0, 3).join("; ") || "none"}`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

async function completeRiskSummary(messages, { llmClient, maxTokens, temperature } = {}) {
  if (llmClient?.complete) {
    const raw = await llmClient.complete(messages, { maxTokens, temperature });
    return { raw: raw?.trim() || "", finishReason: null };
  }
  const completion = await requestCompletion(messages, maxTokens, temperature);
  return {
    raw: completion.choices?.[0]?.message?.content?.trim() || "",
    finishReason: completion.choices?.[0]?.finish_reason,
  };
}

/**
 * @param {object} scan
 * @param {{ llmClient?: { complete: Function, model?: string } }} [opts] — inject BYOK client for CLI local runs
 * @returns {{ text: string|null, verdict: string|null, aiAvailable: boolean, reason: string|null }}
 */
export async function generateRiskSummary(scan, { llmClient } = {}) {
  const messages = buildRiskSummaryMessages(scan);
  const logTag = llmClient?.model ? `[LLM:${llmClient.model}]` : "[OpenRouter]";

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const maxTokens = attempt === 1 ? 120 : 200;
      const { raw, finishReason } = await completeRiskSummary(messages, { llmClient, maxTokens, temperature: 0.3 });
      if (raw) {
        const text = ensureCompleteSentence(raw);
        if (isInvalidAiVerdict(text)) {
          console.warn(`${logTag} generateRiskSummary rejected invalid verdict shape, attempt`, attempt);
          lastError = { message: "invalid_verdict_shape", status: 200 };
          if (attempt < 2) continue;
          break;
        }
        if (finishReason === "length" && attempt < 2) {
          console.warn(`${logTag} generateRiskSummary hit token limit, retrying with higher max_tokens`);
          continue;
        }
        if (attempt > 1) console.log(`${logTag} generateRiskSummary succeeded on retry`);
        return { text, verdict: text, aiAvailable: true, reason: null };
      }
      lastError = { message: "Empty response", status: 200 };
    } catch (e) {
      lastError = e;
      if (llmClient) {
        console.error(`${logTag} generateRiskSummary failed:`, { message: e?.message, attempt });
      } else {
        logOpenRouterError("generateRiskSummary", e, { attempt });
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
    }
  }

  if (llmClient) {
    console.error(`${logTag} generateRiskSummary failed:`, { message: lastError?.message, final: true });
  } else {
    logOpenRouterError("generateRiskSummary", lastError, { final: true });
  }
  const reason = lastError?.message?.slice(0, 120) || "request_failed";
  return { text: null, verdict: null, aiAvailable: false, reason };
}
