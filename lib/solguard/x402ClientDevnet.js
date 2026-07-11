/**
 * x402 client — DEVNET-ONLY proof of concept (Phase 1).
 */
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferCheckedInstruction } from "@solana/spl-token";

const DEVNET_RPC = "https://api.devnet.solana.com";
const USDC_DECIMALS = 6;
const COMPUTE_UNIT_LIMIT = 20_000;
const COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1;
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function decodePaymentRequiredHeader(headerValue) {
  return JSON.parse(atob(headerValue));
}

function walletErrorMessage(err) {
  const msg = err?.message || err?.error?.message || String(err || "");
  if (/reject|denied|cancel/i.test(msg)) return "Payment cancelled in wallet.";
  if (msg === "Unexpected error" || /simulation|revert|simulate/i.test(msg)) {
    return (
      "Phantom could not simulate this devnet payment. " +
      "Ensure Phantom is on Devnet and this wallet holds devnet USDC. " +
      "If Phantom shows Confirm (unsafe), you can approve — the facilitator co-signs."
    );
  }
  return msg || "Wallet signing failed";
}

function buildMemoInstruction(requirements) {
  const sellerMemo = requirements.extra?.memo;
  let memoText;
  if (sellerMemo) {
    memoText = String(sellerMemo);
  } else {
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    memoText = Array.from(nonce, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: new TextEncoder().encode(memoText),
  });
}

/** Warn if Phantom wallet ≠ logged-in SolGuard session (common when user has multiple accounts). */
async function assertWalletMatchesSession(phantomBase58) {
  const res = await fetch("/api/me", { cache: "no-store", headers: authHeaders() });
  const me = await res.json().catch(() => null);
  if (!res.ok || !me?.walletAddress) return;
  if (me.walletAddress !== phantomBase58) {
    const p = `${phantomBase58.slice(0, 4)}…${phantomBase58.slice(-4)}`;
    const s = `${me.walletAddress.slice(0, 4)}…${me.walletAddress.slice(-4)}`;
    throw new Error(
      `Phantom wallet (${p}) does not match your logged-in wallet (${s}). ` +
      "Click Connect wallet and sign in with the Phantom account that holds devnet USDC."
    );
  }
}

async function assertPaymentReadyViaBackend(payerBase58, amountUsdc = 0.1) {
  const res = await fetch(
    `/api/x402/devnet/preflight?owner=${encodeURIComponent(payerBase58)}&amount=${encodeURIComponent(amountUsdc)}`,
    { cache: "no-store", headers: authHeaders() }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Devnet preflight check failed");
  if (!data?.ready) throw new Error(data?.error || "Devnet payment not ready");
}

async function buildSignedPaymentPayload({ requirements, resource, walletProvider, amountUsdc }) {
  const payer = walletProvider?.publicKey;
  if (!payer) throw new Error("Wallet not connected — open Phantom and try again");

  const payerPk = new PublicKey(payer.toString());
  const payerBase58 = payerPk.toBase58();

  await assertWalletMatchesSession(payerBase58);
  await assertPaymentReadyViaBackend(payerBase58, amountUsdc);

  const mintPk = new PublicKey(requirements.asset);
  const destOwnerPk = new PublicKey(requirements.payTo);
  const feePayerPk = new PublicKey(requirements.extra?.feePayer);
  if (!requirements.extra?.feePayer) {
    throw new Error("Payment requirements missing facilitator fee payer — retry in a moment");
  }

  const srcAta = await getAssociatedTokenAddress(mintPk, payerPk);
  const destAta = await getAssociatedTokenAddress(mintPk, destOwnerPk);
  const amount = BigInt(requirements.amount);

  const transferIx = createTransferCheckedInstruction(
    srcAta, mintPk, destAta, payerPk, amount, USDC_DECIMALS
  );

  const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT });
  const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE_MICROLAMPORTS });
  const memoIx = buildMemoInstruction(requirements);

  let blockhash;
  try {
    const conn = new Connection(DEVNET_RPC, "confirmed");
    ({ blockhash } = await conn.getLatestBlockhash("confirmed"));
  } catch {
    throw new Error("Could not reach Solana devnet RPC for blockhash — check your network and retry");
  }

  const messageV0 = new TransactionMessage({
    payerKey: feePayerPk,
    recentBlockhash: blockhash,
    instructions: [computeLimitIx, computePriceIx, transferIx, memoIx],
  }).compileToV0Message();

  const vtx = new VersionedTransaction(messageV0);
  let signed;
  try {
    signed = await walletProvider.signTransaction(vtx);
  } catch (err) {
    throw new Error(walletErrorMessage(err));
  }

  return {
    x402Version: 2,
    resource,
    accepted: requirements,
    payload: { transaction: toBase64(signed.serialize()) },
  };
}

export async function runViaX402({ agentId, inputs, walletProvider, amountUsdc = 0.1 }) {
  const url = `/api/agents/${agentId}/run`;
  const baseHeaders = { "Content-Type": "application/json", ...authHeaders() };
  const bodyStr = JSON.stringify({ inputs, paymentMethod: "x402" });

  const challenge = await fetch(url, { method: "POST", cache: "no-store", headers: baseHeaders, body: bodyStr });
  if (challenge.status !== 402) {
    const data = await challenge.json().catch(() => null);
    if (challenge.ok) return data;
    throw new Error(data?.error || `Unexpected status ${challenge.status} (expected 402)`);
  }

  const reqHeader = challenge.headers.get("payment-required") || challenge.headers.get("PAYMENT-REQUIRED");
  if (!reqHeader) throw new Error("Missing PAYMENT-REQUIRED header on 402 response");

  let paymentRequired;
  try {
    paymentRequired = decodePaymentRequiredHeader(reqHeader);
  } catch {
    throw new Error("Could not read payment requirements from server");
  }

  const requirements = paymentRequired.accepts?.[0];
  if (!requirements) throw new Error("No payment requirements offered");

  const paymentPayload = await buildSignedPaymentPayload({
    requirements,
    resource: paymentRequired.resource,
    walletProvider,
    amountUsdc,
  });

  const xPayment = btoa(JSON.stringify(paymentPayload));

  const settled = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { ...baseHeaders, "X-PAYMENT": xPayment },
    body: bodyStr,
  });
  const data = await settled.json().catch(() => null);
  if (!settled.ok) throw new Error(data?.error || "x402 payment run failed");
  return data;
}
