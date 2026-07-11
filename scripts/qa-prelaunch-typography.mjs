#!/usr/bin/env node
/** Capture homepage + guide screenshots after typography/copy pass. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join("scripts", "qa-screenshots", "prelaunch-typography");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.screenshot({ path: join(OUT, "01-homepage.png"), fullPage: false });

await page.getByRole("button", { name: /guide/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, "02-guide-website.png"), fullPage: true });

await page.getByRole("button", { name: /part 2 — cli/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, "03-guide-cli-beta.png"), fullPage: true });

await browser.close();
console.log("Screenshots saved to", OUT);
