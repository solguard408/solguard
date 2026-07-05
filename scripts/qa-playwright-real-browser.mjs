/**
 * Real browser E2E: DOM fill + click + network capture + screenshots.
 * Run: node scripts/qa-playwright-real-browser.mjs
 * Output: scripts/qa-screenshots/<serviceId>/
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { join } from "path";
import jwt from "jsonwebtoken";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const BASE = "http://localhost:3000";
const OUT = join("scripts", "qa-screenshots");
mkdirSync(OUT, { recursive: true });

const MOCK_USER = {
  id: "qa-browser-user",
  walletAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  credits: 0,
  subscription: null,
};
const MOCK_TOKEN = jwt.sign(
  { userId: MOCK_USER.id, walletAddress: MOCK_USER.walletAddress },
  env.JWT_SECRET,
  { expiresIn: "1h" }
);

const SERVICES = [
  {
    id: "cyber-consultant",
    label: "Your Question",
    sample: "What is the most common Solana token rug-pull pattern in 2025?",
    fieldType: "textarea",
  },
  {
    id: "wallet-verification",
    label: "Wallet Address",
    sample: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    fieldType: "input",
  },
  {
    id: "openclaw-ai-agent-verification",
    label: "Agent Config (JSON)",
    sample: '{"name":"agent","gateway":{"auth":"token"}}',
    fieldType: "input",
  },
  {
    id: "solana-token-verification",
    label: "Token Mint Address",
    sample: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    fieldType: "input",
  },
];

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/config`);
      if (r.ok) return await r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Dev server not reachable on :3000");
}

const cfg = await waitForServer();
console.log("API config:", cfg);
console.log("Mode:", cfg.testingModeFreeRuns ? "TESTING" : "NORMAL");
console.log("Screenshots:", OUT, "\n");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const results = [];

for (const svc of SERVICES) {
  const dir = join(OUT, svc.id);
  mkdirSync(dir, { recursive: true });
  const page = await context.newPage();

  const runRequests = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/agents\/[^/]+\/run/.test(req.url())) {
      runRequests.push({ url: req.url(), body: req.postData() });
    }
  });
  const runResponses = [];
  page.on("response", async (res) => {
    if (res.request().method() === "POST" && /\/api\/agents\/[^/]+\/run/.test(res.url())) {
      let body = null;
      try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
      runResponses.push({ url: res.url(), status: res.status(), body });
    }
  });

  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    })
  );

  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("sg_token", token);
    window.solana = {
      isPhantom: true,
      isConnected: true,
      publicKey: { toBase58: () => user.walletAddress },
      connect: async () => ({ publicKey: { toBase58: () => user.walletAddress } }),
      signMessage: async () => ({ signature: new Uint8Array(64) }),
      signTransaction: async (tx) => tx,
    };
  }, { token: MOCK_TOKEN, user: MOCK_USER });

  await page.goto(`${BASE}/services/${svc.id}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("text=Try it", { timeout: 30000 });

  const formLabels = await page.locator("aside label, .sticky label").allTextContents().catch(() =>
    page.locator("label").allTextContents()
  );
  const pageTitle = await page.locator("h1").first().textContent();

  const field = page.locator(`label:has-text("${svc.label}")`).locator("..").locator("textarea, input").first();
  await field.click();
  await field.fill("");
  await field.pressSequentially(svc.sample, { delay: 5 });

  await page.screenshot({ path: join(dir, "01-filled-form.png"), fullPage: false });

  await page.waitForSelector('button:has-text("Pay & run"), button:has-text("Run (free)"), button:has-text("Connect wallet")', { timeout: 30000 });

  const btn = page.locator('button:has-text("Pay & run"), button:has-text("Run (free)")').first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  const btnText = await btn.textContent();
  const btnEnabled = await btn.isEnabled();

  await btn.click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: join(dir, "02-after-click.png"), fullPage: false });

  const errText = ((await page.locator("p.text-rose-500").textContent()) || "").replace(/^⚠\s*/, "").trim();
  const req = runRequests[0];
  let parsedPayload = null;
  if (req?.body) {
    try { parsedPayload = JSON.parse(req.body); } catch { parsedPayload = req.body; }
  }
  const resp = runResponses[0];

  const urlErr = errText.includes("Endpoint URL") && errText.includes("must start with");
  const pastValidation = !urlErr && (runRequests.length > 0 || errText.includes("owner.toBuffer") || errText.includes("Transaction") || errText.includes("Payment") || errText.includes("Phantom"));
  const wrongLabel = formLabels.some((l) => l.includes("Endpoint URL")) && svc.id !== "dapp-frontend-verification";

  const result = {
    service: svc.id,
    pageTitle: pageTitle?.trim(),
    formLabels: formLabels.map((l) => l.trim()).filter(Boolean),
    buttonText: btnText?.trim(),
    buttonEnabled: btnEnabled,
    uiError: errText || "(none)",
    urlValidationError: urlErr,
    pastValidation,
    wrongFormSchema: wrongLabel,
    networkRequest: parsedPayload,
    networkResponse: resp ? { status: resp.status, error: resp.body?.error || null } : null,
    apiCalled: runRequests.length > 0,
  };
  results.push(result);

  console.log(`\n=== ${svc.id} ===`);
  console.log("  Page title:", result.pageTitle);
  console.log("  Form labels:", result.formLabels.join(" | "));
  console.log("  Button:", result.buttonText, "| enabled:", result.buttonEnabled);
  console.log("  UI error:", result.uiError);
  console.log("  API called:", result.apiCalled);
  if (parsedPayload) {
    console.log("  Request payload:", JSON.stringify(parsedPayload.inputs));
    console.log("  paymentMethod:", parsedPayload.paymentMethod);
  }
  if (resp) console.log("  Response:", resp.status, resp.body?.error || "OK");
  console.log("  Screenshots:", join(dir, "01-filled-form.png"), join(dir, "02-after-click.png"));

  await page.close();
}

await context.close();
await browser.close();

const failed = results.filter((r) => r.urlValidationError || r.wrongFormSchema);
console.log("\n=== SUMMARY ===");
for (const r of results) {
  const status = r.urlValidationError ? "FAIL (URL bug)" : r.pastValidation ? "PASS (past validation)" : r.uiError && r.uiError !== "(none)" ? "WARN" : "PASS";
  console.log(`${status} ${r.service} — error: ${r.uiError || "none"}`);
}
console.log(`\n${results.length - failed.length}/${results.length} without URL schema bug`);
process.exit(failed.length ? 1 : 0);
