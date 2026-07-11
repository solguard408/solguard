#!/usr/bin/env node
import { runWizard } from "../src/wizard.js";

/** Strip common API key patterns from error output. */
function redactSecrets(text) {
  return String(text || "")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/x-api-key['":\s]+[a-zA-Z0-9_-]+/gi, "x-api-key: [REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
}

runWizard().catch((err) => {
  const msg = redactSecrets(err?.message || String(err));
  const cause = err?.cause?.message ? redactSecrets(err.cause.message) : null;
  console.error(`\nError: ${msg}${cause ? ` (${cause})` : ""}\n`);
  process.exit(1);
});
