/**
 * x402 payment path — DEVNET-ONLY (Phase 2).
 *
 * Additive and feature-flagged via lib/solguard/x402Config.js.
 * The existing manual USDC flow (payment.js) is untouched for agents not listed
 * in X402_ENABLED_AGENTS.
 */
import {
  x402EnabledAgents,
  isX402Agent,
  X402_NETWORK,
} from "@/lib/solguard/x402Config";

export { x402EnabledAgents, isX402Agent, X402_NETWORK };

// Solana devnet (CAIP-2). Mainnet is intentionally absent from this file.
export const SOLANA_DEVNET_CAIP2 = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

// Circle devnet USDC mint (override via env if needed).
const DEVNET_USDC = process.env.X402_ASSET_DEVNET || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const USDC_DECIMALS = 6;

/** Devnet-only guard: refuse if someone tries to point this path at anything else. */
function assertDevnetOnly() {
  const net = process.env.X402_NETWORK;
  if (net && net !== SOLANA_DEVNET_CAIP2) {
    throw new Error("x402 is devnet-only in this phase; refusing non-devnet network");
  }
}

function payToDevnet() {
  const addr = process.env.X402_PAY_TO_DEVNET;
  if (!addr) throw new Error("X402_PAY_TO_DEVNET is not configured");
  return addr;
}

let _facilitator = null;
async function getFacilitatorClient() {
  if (_facilitator) return _facilitator;
  const { HTTPFacilitatorClient } = await import("@x402/core/server");
  const overrideUrl = process.env.X402_FACILITATOR_URL;
  if (overrideUrl) {
    // Dev-only: public devnet facilitator (no auth). Never a mainnet URL here.
    _facilitator = new HTTPFacilitatorClient({ url: overrideUrl });
  } else {
    // Default: Coinbase CDP hosted facilitator (reads CDP_API_KEY_ID/SECRET).
    const { facilitator } = await import("@coinbase/x402");
    _facilitator = new HTTPFacilitatorClient(facilitator);
  }
  return _facilitator;
}

let _feePayer = null;
async function getFeePayer() {
  if (_feePayer) return _feePayer;
  const client = await getFacilitatorClient();
  const supported = await client.getSupported();
  const kinds = supported?.kinds || [];
  const kind = kinds.find(
    (k) => k.network === SOLANA_DEVNET_CAIP2 && k.scheme === "exact"
  );
  const feePayer = kind?.extra?.feePayer;
  if (!feePayer) {
    throw new Error("Facilitator does not advertise a devnet exact fee payer");
  }
  _feePayer = feePayer;
  return _feePayer;
}

function amountBaseUnits(amountUsdc) {
  return String(Math.round(Number(amountUsdc) * 10 ** USDC_DECIMALS));
}

/**
 * Build the canonical PaymentRequirements for an agent run. The server always
 * builds this itself (never trusts the client's echoed copy) so amount/payTo
 * cannot be tampered with.
 */
export async function buildRequirements({ amountUsdc }) {
  assertDevnetOnly();
  const feePayer = await getFeePayer();
  return {
    scheme: "exact",
    network: SOLANA_DEVNET_CAIP2,
    asset: DEVNET_USDC,
    amount: amountBaseUnits(amountUsdc),
    payTo: payToDevnet(),
    maxTimeoutSeconds: 60,
    extra: { feePayer },
  };
}

/** Construct the 402 response body + PAYMENT-REQUIRED header value. */
export async function createPaymentRequired({ amountUsdc, resourceUrl, description }) {
  const requirements = await buildRequirements({ amountUsdc });
  const paymentRequired = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: resourceUrl,
      description: description || "SolGuard agent run",
      mimeType: "application/json",
    },
    accepts: [requirements],
  };
  const header = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
  return { header, body: paymentRequired, requirements };
}

/** Decode a base64 X-PAYMENT / PAYMENT-SIGNATURE header into a PaymentPayload. */
export function decodePaymentHeader(headerValue) {
  return JSON.parse(Buffer.from(headerValue, "base64").toString("utf-8"));
}

export async function verifyPayment(paymentPayload, requirements) {
  const client = await getFacilitatorClient();
  return client.verify(paymentPayload, requirements);
}

/** Settle ONLY after the agent has run successfully (never charge for a failed run). */
export async function settlePayment(paymentPayload, requirements) {
  const client = await getFacilitatorClient();
  return client.settle(paymentPayload, requirements);
}

/** Devnet-only preflight — checks payer + merchant before wallet signing. */
export async function checkDevnetPaymentReadiness(payerAddress, amountUsdc = 0.1) {
  assertDevnetOnly();
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");

  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const mint = new PublicKey(DEVNET_USDC);
  const payTo = new PublicKey(payToDevnet());
  const payer = new PublicKey(payerAddress);

  const payerAta = await getAssociatedTokenAddress(mint, payer);
  const merchantAta = await getAssociatedTokenAddress(mint, payTo);
  const requiredAmount = amountBaseUnits(amountUsdc);
  const needLabel = Number(amountUsdc).toFixed(2);

  const short = `${payerAddress.slice(0, 4)}…${payerAddress.slice(-4)}`;

  let merchantOk = false;
  try {
    await getAccount(conn, merchantAta);
    merchantOk = true;
  } catch {
    merchantOk = false;
  }
  if (!merchantOk) {
    return {
      ready: false,
      payerAddress,
      error: "Merchant devnet USDC account is missing. Run: node scripts/setup-x402-devnet-merchant.mjs",
    };
  }

  // Note: do NOT require payer SOL wallet to exist — only devnet USDC ATA + balance matter.
  // A wallet can hold USDC without ever holding SOL (ATA created by a faucet/airdrop).
  try {
    await getAccount(conn, payerAta);
    const bal = await conn.getTokenAccountBalance(payerAta);
    const payerUsdcBalance = bal.value.uiAmountString ?? "0";
    if (BigInt(bal.value.amount) < BigInt(requiredAmount)) {
      return {
        ready: false,
        payerAddress,
        payerUsdcBalance,
        error: `Wallet ${short} has insufficient devnet USDC (need ${needLabel}, have ${payerUsdcBalance}). Fund this exact address on Devnet.`,
      };
    }
    return { ready: true, payerAddress, payerUsdcBalance, merchantUsdcAta: merchantAta.toBase58() };
  } catch {
    return {
      ready: false,
      payerAddress,
      error:
        `Wallet ${short} has no devnet USDC. In Phantom (Devnet mode), get devnet USDC for this address, ` +
        "or reconnect if you funded a different wallet.",
    };
  }
}
