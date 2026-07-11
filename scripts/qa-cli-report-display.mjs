#!/usr/bin/env node
/** Verify saved/API report renders full RESPONSE in terminal output. */
import { readFileSync } from "fs";
import { formatReport } from "../packages/solguard-cli/src/output.js";

const sample = JSON.parse(
  readFileSync("packages/solguard-cli/solguard-report-2026-07-10T22-34-48.json", "utf8")
);
const text = formatReport(sample, { creditsRemaining: 0, mode: "Free (testing mode)" });

const hasResponse = text.includes("RESPONSE") && text.includes("Honeypot tokens");
const responseBeforeFindings =
  text.indexOf("RESPONSE") < text.indexOf("KEY FINDINGS");
const hasCredits = text.includes("Credits remaining:");

if (!hasResponse || !responseBeforeFindings || !hasCredits) {
  console.error("FAIL: report layout invalid");
  console.error({ hasResponse, responseBeforeFindings, hasCredits });
  process.exit(1);
}

console.log("PASS: full RESPONSE shown before findings, credits at end");
console.log("--- preview (first 500 chars) ---");
console.log(text.slice(0, 500));
