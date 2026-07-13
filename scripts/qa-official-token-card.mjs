#!/usr/bin/env node
/** Capture official token card screenshots (desktop + mobile). */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { SOLGUARD_OFFICIAL_TOKEN_CA } from "../lib/solguard/officialToken.js";

const EXPECTED = "Uki1vacqqnJpCfhPpbzj2xCjJ6x5EGFig4LjTJfpump";
if (SOLGUARD_OFFICIAL_TOKEN_CA !== EXPECTED) {
  console.error("CA mismatch!\n got:", SOLGUARD_OFFICIAL_TOKEN_CA, "\nwant:", EXPECTED);
  process.exit(1);
}
console.log("CA verified byte-for-byte:", SOLGUARD_OFFICIAL_TOKEN_CA);

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join("scripts", "qa-screenshots", "official-token-card");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  const heading = page.getByRole("heading", { name: /Official SolGuard Token \(CA\)/i });
  await heading.waitFor({ state: "visible", timeout: 30000 });
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, name) });
  await page.close();
}

await shot("01-desktop.png", { width: 1280, height: 900 });
await shot("02-mobile.png", { width: 390, height: 844 });
await browser.close();
console.log("Screenshots saved to", OUT);
