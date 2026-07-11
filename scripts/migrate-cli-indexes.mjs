#!/usr/bin/env node
/** One-shot: migrate users.walletAddress to sparse unique. Loads .env from repo root. */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const { getDb } = await import(pathToFileURL(resolve(root, "lib/solguard/mongo.js")).href);
const db = await getDb();
const coll = db.collection("users");
const indexes = await coll.indexes();
const wa = indexes.find((i) => i.name === "walletAddress_1");
if (wa && !wa.sparse) {
  console.log("Dropping legacy walletAddress_1 (non-sparse)…");
  await coll.dropIndex("walletAddress_1");
}
await coll.createIndex({ walletAddress: 1 }, { unique: true, sparse: true });
await coll.createIndex({ cliInstallId: 1 }, { unique: true, sparse: true });
console.log("Migration complete. Indexes:", (await coll.indexes()).map((i) => i.name));
