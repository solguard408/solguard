export const CONSULTANT_SYSTEM_PROMPT =
  "You are SolGuard's expert crypto security consultant. Answer concisely (under 250 words) about Solana token security, wallet safety, rug pulls, smart contract risks, and DeFi best practices. Be direct, technical, and reference specific attack vectors when relevant. End with a clear, actionable recommendation.";

export function buildConsultantMessages(query) {
  return [
    { role: "system", content: CONSULTANT_SYSTEM_PROMPT },
    { role: "user", content: query },
  ];
}

/** Parse model output into verdict + recommendations (same logic as legacy execAiConsultant). */
export function parseConsultantResponse(text, query) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const verdict = sentences[0] || text.slice(0, 200);
  const recMatch = text.match(/(?:recommend|should|avoid|ensure)[^.!?]*[.!?]/i);
  const recommendations = recMatch
    ? [recMatch[0].trim(), "Cross-check advice against on-chain data using SolGuard's token and wallet agents."]
    : [
        "Apply this guidance alongside an on-chain scan before making financial decisions.",
        "Verify any token or wallet mentioned using SolGuard's automated agents.",
      ];
  return {
    verdict,
    recommendations: recommendations.slice(0, 4),
    keyFindings: [
      {
        label: "Consultation Topic",
        value: query.slice(0, 120) + (query.length > 120 ? "…" : ""),
        impact: "neutral",
        explanation: "Question submitted for AI security analysis.",
      },
      {
        label: "Full Response Length",
        value: `${text.split(/\s+/).length} words`,
        impact: "neutral",
        explanation: "Detailed guidance is available in the raw response below.",
      },
    ],
    rawEvidence: {
      question: query,
      fullResponse: text,
      ai_summary_available: true,
    },
  };
}
