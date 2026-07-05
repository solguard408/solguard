/**
 * Browser USDC payment — builds tx locally, all RPC reads/writes via /api/rpc/* (Helius server-side).
 */
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function paymentApi(path, opts = {}) {
  const res = await fetch(path, {
    cache: "no-store",
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function serializeToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export async function ensurePhantomProvider() {
  const provider = window.solana;
  if (!provider?.isPhantom) throw new Error("Phantom wallet not detected");
  if (!provider.isConnected) await provider.connect();
  if (!provider.publicKey) throw new Error("Wallet not connected — open Phantom and try again");
  return provider;
}

export async function sendUsdcPayment({ amountUsdc, walletProvider }) {
  const cfg = await paymentApi("/api/payment/config");
  if (!cfg.ok) throw new Error("Payment config unavailable");
  const mintStr = cfg.data.usdcMint || cfg.data.mint;
  const destStr = cfg.data.destWallet || cfg.data.destinationWallet;
  if (!mintStr || !destStr) throw new Error("Payment config incomplete");

  const pk = walletProvider?.publicKey;
  if (!pk) throw new Error("Wallet not connected — open Phantom and try again");

  const payer = new PublicKey(pk.toString());
  const mintPk = new PublicKey(mintStr);
  const destPk = new PublicKey(destStr);
  const srcAta = await getAssociatedTokenAddress(mintPk, payer);
  const destAta = await getAssociatedTokenAddress(mintPk, destPk);

  const [payerAtaRes, destAtaRes, blockhashRes] = await Promise.all([
    paymentApi(`/api/rpc/token-account?mint=${encodeURIComponent(mintStr)}&owner=${encodeURIComponent(payer.toBase58())}`),
    paymentApi(`/api/rpc/token-account?mint=${encodeURIComponent(mintStr)}&owner=${encodeURIComponent(destPk.toBase58())}`),
    paymentApi("/api/rpc/blockhash"),
  ]);

  if (!blockhashRes.ok) throw new Error(blockhashRes.data?.error || "Failed to fetch blockhash");
  if (!payerAtaRes.ok || !destAtaRes.ok) {
    throw new Error(payerAtaRes.data?.error || destAtaRes.data?.error || "Failed to check token accounts");
  }

  const ixs = [];
  if (!payerAtaRes.data.exists) {
    ixs.push(createAssociatedTokenAccountInstruction(payer, srcAta, payer, mintPk));
  }
  if (!destAtaRes.data.exists) {
    ixs.push(createAssociatedTokenAccountInstruction(payer, destAta, destPk, mintPk));
  }

  const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000));
  ixs.push(createTransferCheckedInstruction(srcAta, mintPk, destAta, payer, amountRaw, 6));

  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer;
  tx.recentBlockhash = blockhashRes.data.blockhash;

  const signed = await walletProvider.signTransaction(tx);
  const sendRes = await paymentApi("/api/rpc/send-transaction", {
    method: "POST",
    body: JSON.stringify({ transaction: serializeToBase64(signed.serialize()) }),
  });
  if (!sendRes.ok) throw new Error(sendRes.data?.error || "Transaction submission failed");
  return sendRes.data.signature;
}
