/**
 * One-time devnet setup for x402 merchant receiving account.
 *
 * x402 Path-1 payment txs cannot include "create token account" instructions,
 * so the merchant MUST already have a devnet USDC ATA before accepting payments.
 *
 * Usage:
 *   node scripts/setup-x402-devnet-merchant.mjs              # check only
 *   DEVNET_MERCHANT_SECRET=<base58-secret> node scripts/setup-x402-devnet-merchant.mjs
 *
 * X402_PAY_TO_DEVNET must be a wallet that exists on DEVNET (Phantom devnet address).
 * Do not reuse a mainnet-only address here.
 */
import { readFileSync } from "fs";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

const DEVNET_RPC = "https://api.devnet.solana.com";
const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const payToStr = env.X402_PAY_TO_DEVNET || process.env.X402_PAY_TO_DEVNET;
if (!payToStr) {
  console.error("Set X402_PAY_TO_DEVNET in .env to your Phantom DEVNET wallet address.");
  process.exit(1);
}

const conn = new Connection(DEVNET_RPC, "confirmed");
const mint = new PublicKey(DEVNET_USDC);
const payTo = new PublicKey(payToStr);
const ata = await getAssociatedTokenAddress(mint, payTo);

console.log("Devnet merchant setup check\n");
console.log("  Pay-to wallet:", payToStr);
console.log("  USDC mint:    ", DEVNET_USDC);
console.log("  Merchant ATA: ", ata.toBase58());

const walletInfo = await conn.getAccountInfo(payTo);
console.log("  Wallet on devnet:", walletInfo ? `yes (${walletInfo.lamports} lamports)` : "NO — address never funded on devnet");

let ataExists = false;
try {
  await getAccount(conn, ata);
  ataExists = true;
} catch {
  ataExists = false;
}
console.log("  USDC ATA exists: ", ataExists ? "yes" : "NO — payments will fail until this is created");

if (walletInfo && ataExists) {
  console.log("\n✓ Merchant devnet setup looks good.");
  process.exit(0);
}

const secret = process.env.DEVNET_MERCHANT_SECRET || env.DEVNET_MERCHANT_SECRET;
if (!secret) {
  console.log("\n--- Manual setup ---");
  console.log("1. In Phantom: Settings → Developer Settings → enable Testnet Mode → switch to Devnet.");
  console.log("2. Copy your Phantom DEVNET address into .env as X402_PAY_TO_DEVNET=...");
  console.log("3. Airdrop devnet SOL to that wallet (Phantom has an airdrop button, or use faucet.solana.com).");
  console.log("4. Re-run with your devnet wallet secret to create the USDC ATA:");
  console.log("   DEVNET_MERCHANT_SECRET=<base58-private-key> node scripts/setup-x402-devnet-merchant.mjs");
  console.log("\n   Or create the ATA in Phantom by receiving devnet USDC once (faucet creates the account).");
  process.exit(ataExists ? 0 : 1);
}

const kp = Keypair.fromSecretKey(bs58.decode(secret));
if (kp.publicKey.toBase58() !== payToStr) {
  console.error("DEVNET_MERCHANT_SECRET does not match X402_PAY_TO_DEVNET");
  process.exit(1);
}

if (!walletInfo) {
  console.log("\nAirdropping 1 SOL on devnet...");
  const sig = await conn.requestAirdrop(kp.publicKey, 1e9);
  await conn.confirmTransaction(sig, "confirmed");
  console.log("  Airdrop tx:", sig);
}

if (!ataExists) {
  console.log("\nCreating merchant USDC ATA...");
  const ix = createAssociatedTokenAccountInstruction(kp.publicKey, ata, payTo, mint);
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [kp]);
  console.log("  Create ATA tx:", sig);
  console.log("\n✓ Merchant USDC ATA created on devnet.");
} else {
  console.log("\n✓ Already set up.");
}
