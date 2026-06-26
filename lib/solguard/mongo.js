import { MongoClient } from "mongodb";

const dbName = process.env.DB_NAME || "solguard";

let cachedClient = null;
let cachedDb = null;
let cachedUri = null;

export async function getDb() {
  const currentUri = process.env.MONGO_URL;

  // If connection string changes (e.g. hot reload), close and reconstruct client
  if (cachedClient && cachedUri !== currentUri) {
    console.log("[db] MONGO_URL changed, closing old connection client...");
    try { await cachedClient.close(); } catch (e) {}
    cachedClient = null;
    cachedDb = null;
  }

  if (cachedDb) return cachedDb;

  if (!cachedClient) {
    cachedUri = currentUri;
    cachedClient = new MongoClient(currentUri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000
    });
    try {
      await cachedClient.connect();
    } catch (e) {
      cachedClient = null;
      cachedUri = null;
      throw e;
    }
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}
