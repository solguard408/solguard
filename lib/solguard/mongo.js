import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URL;
const dbName = process.env.DB_NAME || "solguard";

let cachedClient = null;
let cachedDb = null;

export async function getDb() {
  if (cachedDb) return cachedDb;
  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}
