/** Strip common API key patterns from strings before logging or display. */
export function redactSecrets(text) {
  return String(text || "")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/x-api-key['":\s]+[a-zA-Z0-9_-]+/gi, "x-api-key: [REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/api[_-]?key['":\s=]+[a-zA-Z0-9_-]{12,}/gi, "api_key=[REDACTED]");
}
