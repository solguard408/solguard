import { getDb } from "./mongo";

let initialized = false;

export async function initializeDatabase() {
  if (initialized) return;
  try {
    const db = await getDb();
    console.log("[db] Initializing database indexes...");

    // 1. users: unique index on walletAddress, unique index on id
    await db.collection("users").createIndex({ walletAddress: 1 }, { unique: true });
    await db.collection("users").createIndex({ id: 1 }, { unique: true });

    // 2. nonces: unique index on walletAddress, TTL index on createdAt (expires after 5 minutes)
    await db.collection("nonces").createIndex({ walletAddress: 1 }, { unique: true });
    await db.collection("nonces").createIndex({ createdAt: 1 }, { expireAfterSeconds: 300 });

    // 3. apikeys: unique index on key, index on userId
    await db.collection("apikeys").createIndex({ key: 1 }, { unique: true });
    await db.collection("apikeys").createIndex({ userId: 1 });

    // 4. subscriptions: index on userId, index on expiresAt
    await db.collection("subscriptions").createIndex({ userId: 1 });
    await db.collection("subscriptions").createIndex({ expiresAt: 1 });

    // 5. watchlist: compound unique index on userId + tokenAddress
    await db.collection("watchlist").createIndex({ userId: 1, tokenAddress: 1 }, { unique: true });

    // 6. watch_state: unique index on tokenAddress
    await db.collection("watch_state").createIndex({ tokenAddress: 1 }, { unique: true });

    // 7. reports: index on userId, index on createdAt
    await db.collection("reports").createIndex({ userId: 1 });
    await db.collection("reports").createIndex({ createdAt: -1 });

    // 8. payments: unique index on signature
    await db.collection("payments").createIndex({ signature: 1 }, { unique: true });

    // 9. alerts: index on userId, index on createdAt
    await db.collection("alerts").createIndex({ userId: 1 });
    await db.collection("alerts").createIndex({ createdAt: -1 });

    // 10. scans: unique index on id
    await db.collection("scans").createIndex({ id: 1 }, { unique: true });

    initialized = true;
    console.log("[db] Database indexes initialized successfully.");
  } catch (e) {
    console.error("[db] Error initializing database indexes:", e?.message || e);
  }
}
