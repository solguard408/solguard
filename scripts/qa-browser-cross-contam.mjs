/**
 * Regression: dApp page → consultant page must not show Endpoint URL schema/error.
 * Run: node scripts/qa-browser-cross-contam.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const QUESTION = "What is the most common Solana token rug-pull pattern in 2025?";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`${BASE}/services/dapp-frontend-verification`, { waitUntil: "networkidle" });
await page.locator('label:has-text("Endpoint URL")').locator("..").locator("input").fill(QUESTION);
await page.goto(`${BASE}/services/cyber-consultant`, { waitUntil: "networkidle" });
await page.waitForSelector('label:has-text("Your Question")');

const hasEndpoint = await page.locator('label:has-text("Endpoint URL")').count();
const hasQuestion = await page.locator('label:has-text("Your Question")').count();
await page.locator('label:has-text("Your Question")').locator("..").locator("textarea").fill(QUESTION);

const btn = page.locator('button:has-text("Connect wallet & run")').first();
await btn.click();
await page.waitForTimeout(400);

const errText = ((await page.locator("p.text-rose-500").textContent()) || "").replace(/^⚠\s*/, "");
const pass = hasEndpoint === 0 && hasQuestion === 1 && !errText.includes("Endpoint URL") && !errText.includes("must start with http");

console.log(`dApp→consultant navigation: ${pass ? "PASS" : "FAIL"}`);
console.log(`  Endpoint URL label count: ${hasEndpoint} (expected 0)`);
console.log(`  Your Question label count: ${hasQuestion} (expected 1)`);
console.log(`  error: ${errText || "(none)"}`);

await browser.close();
process.exit(pass ? 0 : 1);
