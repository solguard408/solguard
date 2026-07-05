/**
 * Normal-mode browser QA: client form validation before payment (no wallet needed).
 * Expect no URL error on non-dApp services when valid typed input is submitted.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SERVICES = [
  { id: "cyber-consultant", label: "Your Question", sample: "What is the most common Solana token rug-pull pattern in 2025?" },
  { id: "wallet-verification", label: "Wallet Address", sample: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" },
  { id: "openclaw-ai-agent-verification", label: "Agent Config (JSON)", sample: '{"name":"agent","gateway":{"auth":"token"}}' },
  { id: "solana-token-verification", label: "Token Mint Address", sample: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { id: "private-data-verification", label: "Data to commit", sample: "customer-record-8842:status=verified" },
  { id: "quantum-cryptography-verification", label: "Data to encrypt", sample: "confidential-api-key-rotation-schedule-2026" },
  { id: "smart-contract-audit", label: "Token Mint Address", sample: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { id: "dapp-frontend-verification", label: "Endpoint URL", sample: "https://solana.com", expectUrlOk: true },
];

const cfg = await fetch(`${BASE}/api/config`).then((r) => r.json());
if (cfg.testingModeFreeRuns) {
  console.error("Set TESTING_MODE_FREE_RUNS=false before running this script");
  process.exit(1);
}
console.log("Normal mode (testingModeFreeRuns=false)\n");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let pass = 0;

for (const svc of SERVICES) {
  await page.goto(`${BASE}/services/${svc.id}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Try it");
  const field = page.locator(`label:has-text("${svc.label}")`).locator("..").locator("input, textarea").first();
  await field.fill(svc.sample);
  const btn = page.locator('button:has-text("Connect wallet & run"), button:has-text("Pay & run")').first();
  const enabled = await btn.isEnabled();
  await btn.click();
  await page.waitForTimeout(400);
  const err = ((await page.locator("p.text-rose-500").textContent()) || "").replace(/^⚠\s*/, "");
  const urlErr = err.includes("Endpoint URL") || err.includes("must start with http");
  const ok = enabled && !urlErr && (svc.expectUrlOk ? !err.includes("Endpoint URL") || err === "" : true);
  const failReason = !enabled ? "button disabled" : urlErr ? err : err && !err.includes("Phantom") ? err : "OK (wallet step)";
  console.log(`${ok ? "PASS" : "FAIL"} ${svc.id} — ${failReason}`);
  if (ok) pass++;
}

await browser.close();
console.log(`\n${pass}/${SERVICES.length} passed`);
process.exit(pass === SERVICES.length ? 0 : 1);
