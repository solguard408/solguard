/**
 * QA for the x402 devnet POC (Phase 1).
 *
 * Part A (no server / no wallet needed): validate facilitator assumptions.
 *   - @x402/core/server exposes HTTPFacilitatorClient
 *   - @coinbase/x402 exposes the CDP facilitator config
 *   - the configured facilitator advertises Solana DEVNET + scheme "exact"
 *     and returns a fee payer (sponsor) — the values our server relies on
 *   - a spec-shaped PaymentRequired can be built for $0.10
 *
 * Facilitator selection:
 *   - default: public devnet facilitator (no keys) so this runs anywhere
 *   - set X402_FACILITATOR_URL to override
 *   - if CDP_API_KEY_ID/CDP_API_KEY_SECRET are set and no URL override,
 *     the real CDP hosted facilitator is used instead
 *
 * Run: node scripts/qa-x402-devnet.mjs
 */
import { HTTPFacilitatorClient } from "@x402/core/server";

const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const DEVNET_USDC = process.env.X402_ASSET_DEVNET || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const PAY_TO = process.env.X402_PAY_TO_DEVNET || "11111111111111111111111111111111"; // placeholder for shape test

function ok(m) { console.log(`  \u2713 ${m}`); }
function fail(m) { console.error(`  \u2717 ${m}`); process.exitCode = 1; }

async function getClient() {
  const url = process.env.X402_FACILITATOR_URL;
  if (url) return { client: new HTTPFacilitatorClient({ url }), label: url };
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
    const { facilitator } = await import("@coinbase/x402");
    return { client: new HTTPFacilitatorClient(facilitator), label: "CDP hosted facilitator" };
  }
  return { client: new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" }), label: "public devnet facilitator" };
}

(async () => {
  console.log("x402 devnet POC — Part A (facilitator capability checks)\n");

  // 1) @coinbase/x402 export shape (does not require keys to inspect).
  try {
    const mod = await import("@coinbase/x402");
    if (mod.facilitator) ok("@coinbase/x402 exposes `facilitator` (CDP config)");
    else fail("@coinbase/x402 missing `facilitator` export");
  } catch (e) {
    fail(`could not import @coinbase/x402: ${e.message}`);
  }

  const { client, label } = await getClient();
  console.log(`\nUsing facilitator: ${label}`);

  // 2) getSupported -> devnet exact + feePayer
  let feePayer = null;
  try {
    const supported = await client.getSupported();
    const kinds = supported?.kinds || [];
    const kind = kinds.find((k) => k.network === SOLANA_DEVNET_CAIP2 && k.scheme === "exact");
    if (!kind) {
      fail(`facilitator does not advertise devnet exact (networks seen: ${[...new Set(kinds.map((k) => k.network))].join(", ") || "none"})`);
    } else {
      ok(`facilitator supports Solana devnet + scheme "exact"`);
      feePayer = kind?.extra?.feePayer;
      if (feePayer) ok(`fee payer (sponsor) advertised: ${feePayer}`);
      else fail("no extra.feePayer advertised for devnet exact");
    }
  } catch (e) {
    fail(`getSupported() failed: ${e.message}`);
  }

  // 3) Build a spec-shaped PaymentRequired for $0.10.
  const requirements = {
    scheme: "exact",
    network: SOLANA_DEVNET_CAIP2,
    asset: DEVNET_USDC,
    amount: String(Math.round(0.1 * 1e6)),
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { feePayer: feePayer || "<from-facilitator>" },
  };
  const paymentRequired = {
    x402Version: 2,
    error: "Payment required",
    resource: { url: "https://solguard.example/api/agents/ai-consultant/run", description: "SolGuard AI Consultant", mimeType: "application/json" },
    accepts: [requirements],
  };
  const header = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
  ok(`built PaymentRequired (amount=${requirements.amount} base units, asset=${DEVNET_USDC})`);
  console.log("\n  PAYMENT-REQUIRED (base64, first 80 chars):");
  console.log(`  ${header.slice(0, 80)}...`);

  console.log("\nPart A complete. Part B (402 challenge + bypass ordering) requires a running");
  console.log("dev server with X402_ENABLED_AGENTS set — see scripts/qa-x402-server.mjs.");
})();
