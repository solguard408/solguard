/**
 * Verify Pay & Run flow: console must have zero errors; past validation + wallet connect.
 * Run: node scripts/qa-verify-run-flow.mjs
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { join } from "path";
import jwt from "jsonwebtoken";
import { PublicKey } from "@solana/web3.js";

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
const OUT = join("scripts", "qa-screenshots", "verify-run");
mkdirSync(OUT, { recursive: true });

const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MOCK_USER = { id: "qa-verify", walletAddress: WALLET, credits: 0, subscription: null };
const token = jwt.sign({ userId: MOCK_USER.id, walletAddress: WALLET }, env.JWT_SECRET, { expiresIn: "1h" });
const pk = new PublicKey(WALLET);

const SERVICES = [
  { id: "cyber-consultant", label: "Your Question", sample: "What is the most common Solana token rug-pull pattern in 2025?" },
  { id: "wallet-verification", label: "Wallet Address", sample: WALLET },
  { id: "solana-token-verification", label: "Token Mint Address", sample: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

for (const svc of SERVICES) {
  const page = await context.newPage();
  const consoleLogs = [];
  const pageErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleLogs.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack || ""}`));

  await page.route("**/api/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
  );

  await page.addInitScript(({ t, wallet }) => {
    localStorage.setItem("sg_token", t);
    const mockPk = { toBase58: () => wallet, toString: () => wallet };
    window.solana = {
      isPhantom: true,
      isConnected: false,
      publicKey: null,
      connect: async () => {
        window.solana.isConnected = true;
        window.solana.publicKey = mockPk;
        return { publicKey: mockPk };
      },
      signMessage: async () => ({ signature: new Uint8Array(64) }),
      signTransaction: async (tx) => tx,
    };
  }, { t: token, wallet: WALLET });

  await page.goto(`${BASE}/services/${svc.id}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("text=Try it");
  await page.locator(`label:has-text("${svc.label}")`).locator("..").locator("textarea, input").first().fill(svc.sample);
  await page.locator('button:has-text("Pay & run")').click();
  await page.waitForTimeout(4000);

  const uiErr = ((await page.locator("p.text-rose-500").textContent()) || "").replace(/^⚠\s*/, "").trim();
  await page.screenshot({ path: join(OUT, `${svc.id}.png`) });

  const badUi = uiErr.includes("toString") || uiErr.includes("Endpoint URL must start");
  const ok = !badUi && pageErrors.length === 0 && !consoleLogs.some((l) => l.includes("toString"));

  console.log(`\n=== ${svc.id} ===`);
  console.log("  UI error:", uiErr || "(none)");
  console.log("  pageerror count:", pageErrors.length);
  console.log("  console.error count:", consoleLogs.length);
  if (pageErrors.length) console.log("  pageerror:", pageErrors[0].split("\n").slice(0, 3).join(" | "));
  console.log("  Result:", ok ? "PASS" : "FAIL");
  console.log("  Screenshot:", join(OUT, `${svc.id}.png`));

  await page.close();
}

await browser.close();
