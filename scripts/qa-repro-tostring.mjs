/** Capture console stack trace for toString null error. */
import { chromium } from "playwright";
import { readFileSync } from "fs";
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

const MOCK_USER = {
  id: "qa-user",
  walletAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  credits: 0,
};
const token = jwt.sign({ userId: MOCK_USER.id, walletAddress: MOCK_USER.walletAddress }, env.JWT_SECRET, { expiresIn: "1h" });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (msg) => logs.push({ type: msg.type(), text: msg.text() }));
page.on("pageerror", (err) => logs.push({ type: "pageerror", text: err.message, stack: err.stack }));

await page.route("**/api/me", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_USER) })
);

// Logged-in JWT but Phantom disconnected (publicKey null) — reproduces user report
await page.addInitScript((t) => {
  localStorage.setItem("sg_token", t);
  window.solana = { isPhantom: true, isConnected: false, publicKey: null, connect: async () => ({ publicKey: null }) };
}, token);

await page.goto("http://localhost:3000/services/cyber-consultant", { waitUntil: "networkidle" });
await page.locator('label:has-text("Your Question")').locator("..").locator("textarea").fill("What is the most common Solana token rug-pull pattern in 2025?");
await page.locator('button:has-text("Pay & run")').click();
await page.waitForTimeout(2000);

const err = await page.locator("p.text-rose-500").textContent();
console.log("UI error:", err?.replace(/^⚠\s*/, ""));
console.log("\nConsole / page errors:");
for (const l of logs) {
  if (l.type === "pageerror" || l.text.includes("toString") || l.text.includes("TypeError")) {
    console.log(`[${l.type}]`, l.text);
    if (l.stack) console.log(l.stack);
  }
}

await browser.close();
