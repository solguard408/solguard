#!/usr/bin/env node
import { runWizard } from "../src/wizard.js";
import { redactSecrets } from "../src/redact.js";

runWizard().catch((err) => {
  const msg = redactSecrets(err?.message || String(err));
  const cause = err?.cause?.message ? redactSecrets(err.cause.message) : null;
  console.error(`\nError: ${msg}${cause ? ` (${cause})` : ""}\n`);
  process.exit(1);
});
