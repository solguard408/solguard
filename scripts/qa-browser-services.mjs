/**
 * Browser QA: validate Try-it forms for all 8 marketplace services.
 * Requires dev server on :3000. Run: node scripts/qa-browser-services.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SERVICES = [
  {
    id: "cyber-consultant",
    label: "Your Question",
    sample: "What is the most common Solana token rug-pull pattern in 2025?",
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "wallet-verification",
    label: "Wallet Address",
    sample: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "openclaw-ai-agent-verification",
    label: "Agent Config (JSON)",
    sample: '{"name":"agent","gateway":{"auth":"token"}}',
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "solana-token-verification",
    label: "Token Mint Address",
    sample: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "private-data-verification",
    label: "Data to commit",
    sample: "customer-record-8842:status=verified",
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "quantum-cryptography-verification",
    label: "Data to encrypt",
    sample: "confidential-api-key-rotation-schedule-2026",
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "smart-contract-audit",
    label: "Token Mint Address",
    sample: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    mustNotInclude: ["Endpoint URL", "Website URL must start"],
  },
  {
    id: "dapp-frontend-verification",
    label: "Endpoint URL",
    sample: "https://solana.com",
    mustNotInclude: [],
    expectEnabled: true,
  },
];

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Dev server not reachable on :3000");
}

await waitForServer();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const results = [];

for (const svc of SERVICES) {
  const url = `${BASE}/services/${svc.id}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Try it", { timeout: 15000 });

  const formLabel = await page.locator(`label:has-text("${svc.label}")`).first().textContent().catch(() => null);
  const schemaOk = formLabel?.includes(svc.label);

  const field = page.locator(`label:has-text("${svc.label}")`).locator("..").locator("input, textarea").first();
  await field.fill(svc.sample);

  const btn = page.locator('button:has-text("Pay & run"), button:has-text("Connect wallet & run"), button:has-text("Run (free)")').first();
  const enabled = await btn.isEnabled();

  await btn.click();
  await page.waitForTimeout(500);

  const errEl = page.locator("p.text-rose-500");
  const errText = (await errEl.textContent().catch(() => "")) || "";
  const badUrl = svc.mustNotInclude.some((s) => errText.includes(s));
  const pass = schemaOk && !badUrl && (svc.expectEnabled ? enabled : true);

  results.push({
    service: svc.id,
    pass,
    schemaLabel: formLabel?.trim(),
    buttonEnabled: enabled,
    error: errText.replace(/^⚠\s*/, "").trim() || "(none)",
  });

  console.log(`${pass ? "PASS" : "FAIL"} ${svc.id}`);
  console.log(`  label: ${formLabel?.trim()}`);
  console.log(`  button enabled: ${enabled}`);
  console.log(`  error after click: ${errText.replace(/^⚠\s*/, "").trim() || "(none)"}`);
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
