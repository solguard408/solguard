// USDC payment verification on Solana mainnet via Helius RPC.
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getDb } from "./mongo";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const USDC_MINT = process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEST_WALLET = process.env.USDC_DEST_WALLET || "AnBTwJniieVxumvA2dokUacKArswfKaeAY5vLotGTiZ3";

let _conn = null;
function getConn() { if (!_conn) _conn = new Connection(RPC_URL, "confirmed"); return _conn; }

export function getPaymentConfig() {
  return { mint: USDC_MINT, destWallet: DEST_WALLET };
}

// Verify that signature represents an SPL token transfer of >= amountUsdc to our dest wallet.
// Returns { ok: true, payer } on success or { ok: false, error } on failure.
export async function verifyUsdcPayment({ signature, amountUsdc, payerAddress = null }) {
  if (!signature || typeof signature !== "string" || signature.length < 32) return { ok: false, error: "Missing payment signature" };
  const db = await getDb();

  // Dedupe
  const existing = await db.collection("payments").findOne({ signature });
  if (existing) return { ok: false, error: "Payment already used" };

  const conn = getConn();
  let tx = null;
  // Allow a small retry while confirmations propagate
  for (let i = 0; i < 6; i++) {
    tx = await conn.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!tx) return { ok: false, error: "Transaction not found on-chain yet. Please retry in a few seconds." };
  if (tx.meta?.err) return { ok: false, error: "Transaction failed on-chain" };

  const destPubkey = new PublicKey(DEST_WALLET);
  const usdcMintPubkey = new PublicKey(USDC_MINT);
  const destAta = await getAssociatedTokenAddress(usdcMintPubkey, destPubkey);
  const destAtaStr = destAta.toBase58();

  // Look at postTokenBalances/preTokenBalances delta on the destination ATA
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];
  const accountKeys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey.toBase58()));

  // Find balance delta for destination ATA (or destination wallet directly)
  let credited = 0;
  for (const b of post) {
    const addr = accountKeys[b.accountIndex];
    if (b.mint !== USDC_MINT) continue;
    const isDest = addr === destAtaStr || b.owner === DEST_WALLET;
    if (!isDest) continue;
    const preBal = pre.find((p) => p.accountIndex === b.accountIndex);
    const postUi = Number(b.uiTokenAmount?.uiAmount || 0);
    const preUi = Number(preBal?.uiTokenAmount?.uiAmount || 0);
    credited += postUi - preUi;
  }

  if (credited + 1e-9 < amountUsdc) {
    return { ok: false, error: `Insufficient USDC transferred to destination. Got ${credited.toFixed(6)}, expected ${amountUsdc}` };
  }

  // Identify payer from signers
  const signers = (tx.transaction?.message?.accountKeys || []).filter((k) => (typeof k === "object" ? k.signer : false));
  const payer = signers.length ? (typeof signers[0] === "object" ? signers[0].pubkey.toBase58() : signers[0]) : (payerAddress || null);

  // Record payment to dedupe future
  await db.collection("payments").insertOne({ signature, amount: credited, payer, createdAt: new Date() });
  return { ok: true, payer, amount: credited };
}
