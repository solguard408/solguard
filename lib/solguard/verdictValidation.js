/** Detect model outputs that leak prompts or dump raw scan fields instead of a verdict. */
export function isInvalidAiVerdict(text) {
  if (!text || typeof text !== "string") return true;
  const t = text.trim();
  if (t.length < 12 || t.length > 420) return true;

  const lower = t.toLowerCase();
  const leakPhrases = [
    "we need to produce",
    "must reference specific",
    "must be plain english",
    "must not truncate",
    "must be a single",
    "ending with a period",
    "do not start with",
    "do not truncate",
    "do not use asterisks",
    "no bullet points",
    "write exactly one",
    "output rules",
    "we have data:",
    "risk factors:",
  ];
  if (leakPhrases.some((p) => lower.includes(p))) return true;

  const fieldHits = (lower.match(/risk score:|freeze authority:|mint authority:|bundle detected:|top holder:|top 10 holders:|liquidity (pool|usd):/g) || []).length;
  if (fieldHits >= 2) return true;

  return false;
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
