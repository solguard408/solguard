// Server-side Solana RPC via Helius — never expose HELIUS_API_KEY to the browser.
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : null;

let _conn = null;
function getConn() {
  if (!RPC_URL) throw new Error("HELIUS_API_KEY not configured");
  if (!_conn) _conn = new Connection(RPC_URL, "confirmed");
  return _conn;
}

async function withRetry(fn, { attempts = 2, delayMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export async function fetchLatestBlockhash() {
  return withRetry(async () => {
    const { blockhash, lastValidBlockHeight } = await getConn().getLatestBlockhash("confirmed");
    return { blockhash, lastValidBlockHeight };
  });
}

/** @param {string} mintBase58 @param {string} ownerBase58 */
export async function tokenAccountExists(mintBase58, ownerBase58) {
  return withRetry(async () => {
    const mint = new PublicKey(mintBase58);
    const owner = new PublicKey(ownerBase58);
    const ata = await getAssociatedTokenAddress(mint, owner);
    try {
      await getAccount(getConn(), ata);
      return true;
    } catch {
      return false;
    }
  });
}

/** @param {string} encodedTransaction base64 serialized signed transaction */
export async function sendSignedTransaction(encodedTransaction) {
  if (!encodedTransaction || typeof encodedTransaction !== "string") {
    throw new Error("transaction required");
  }
  const raw = Buffer.from(encodedTransaction, "base64");
  if (raw.length > 1232 * 3) throw new Error("Transaction too large");

  return withRetry(async () => {
    const conn = getConn();
    const sig = await conn.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return sig;
  });
}
