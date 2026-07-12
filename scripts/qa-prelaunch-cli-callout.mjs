#!/usr/bin/env node
/** Capture homepage CLI callout + guide screenshots for pre-launch review. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join("scripts", "qa-screenshots", "prelaunch-cli-callout");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function prepare(page) {
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("text=SolGuard, right from your terminal", { timeout: 30000 });
  // Wait until Tailwind has applied (styled trust button), not raw browser defaults
  await page.waitForFunction(() => {
    const el = document.querySelector("button, .bg-trust-600, .text-trust-600");
    if (!el) return false;
    const bg = getComputedStyle(el).backgroundColor;
    const ff = getComputedStyle(document.body).fontFamily;
    return ff.toLowerCase().includes("inter") || bg !== "rgba(0, 0, 0, 0)";
  }, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await prepare(desktop);
await desktop.getByRole("heading", { name: /right from your terminal/i }).scrollIntoViewIfNeeded();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: join(OUT, "01-homepage-desktop.png") });

await desktop.getByRole("button", { name: /full cli guide/i }).click();
await desktop.waitForSelector("text=Local mode", { timeout: 15000 });
await desktop.waitForTimeout(400);
await desktop.screenshot({ path: join(OUT, "03-guide-cli-verifying.png"), fullPage: true });
await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await prepare(mobile);
await mobile.getByRole("heading", { name: /right from your terminal/i }).scrollIntoViewIfNeeded();
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: join(OUT, "02-homepage-mobile.png") });
await mobile.close();

await browser.close();
console.log("Screenshots saved to", OUT);
