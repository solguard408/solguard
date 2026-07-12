import { buildReport, finding } from "../reportBuilder.js";
import { buildConsultantMessages, parseConsultantResponse } from "../llm/prompts/consultant.js";

const DEFAULT_DATA_SOURCE = ["OpenRouter AI"];

function logConsultantError(e, extra = {}, model = "unknown") {
  const message = String(e?.message || "")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
  console.error("[LLM] AI consultant failed:", {
    status: e?.status ?? e?.code ?? "unknown",
    message,
    model,
    ...extra,
  });
}

/**
 * Run the AI security consultant agent — shared by Next.js backend and CLI BYOK.
 * @param {{ query: string }} inputs
 * @param {{ llmClient: { complete: Function, model: string }, dataSource?: string[], maxAttempts?: number }} opts
 */
export async function runConsultant({ query }, { llmClient, dataSource = DEFAULT_DATA_SOURCE, maxAttempts = 2 } = {}) {
  if (!query?.trim()) throw new Error("query is required");
  if (!llmClient?.complete) throw new Error("llmClient is required");

  const messages = buildConsultantMessages(query.trim());
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = await llmClient.complete(messages, { maxTokens: 600, temperature: 0.6 });
      if (text) {
        const parsed = parseConsultantResponse(text, query.trim());
        return buildReport({
          agentId: "ai-consultant",
          input: query.trim(),
          riskScore: 0,
          riskLevel: "LOW",
          verdict: parsed.verdict,
          keyFindings: parsed.keyFindings.map((f) => finding(f.label, f.value, f.impact, f.explanation)),
          recommendations: parsed.recommendations,
          confidence: "Medium — AI-generated guidance; verify with on-chain scans",
          dataSource,
          rawEvidence: parsed.rawEvidence,
          ai_summary_available: true,
          ai_summary_reason: null,
        });
      }
      lastError = new Error("Empty AI response");
    } catch (e) {
      lastError = e;
      logConsultantError(e, { attempt }, llmClient.model);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 800));
    }
  }

  logConsultantError(lastError, { final: true }, llmClient.model);
  throw new Error(`AI consultant unavailable: ${lastError?.message || "LLM request failed"}`);
}
