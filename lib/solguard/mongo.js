import { MongoClient } from "mongodb";

const dbName = process.env.DB_NAME || "solguard";

let cachedClient = null;
let cachedDb = null;
let cachedUri = null;

export class DatabaseConnectionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "DatabaseConnectionError";
    this.cause = cause;
  }
}

/** Host only — never log credentials. */
export function redactMongoHost(uri) {
  if (!uri) return "(not set)";
  const hostMatch = uri.match(/@([^/?]+)/);
  if (hostMatch) return hostMatch[1];
  const bareMatch = uri.match(/mongodb(?:\+srv)?:\/\/([^/?]+)/);
  return bareMatch ? bareMatch[1] : "(unknown host)";
}

const MONGO_DRIVER_ERRORS = new Set([
  "MongoServerSelectionError",
  "MongoTopologyClosedError",
  "MongoNetworkError",
  "MongoServerError",
]);

export function isDatabaseConnectionError(err) {
  if (err instanceof DatabaseConnectionError) return true;
  if (!err) return false;
  // Duplicate key / validation errors are not connectivity failures
  if (err.code === 11000 || err.code === 11001) return false;
  if (MONGO_DRIVER_ERRORS.has(err.name)) return true;
  const code = err.code;
  return code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" || code === "ENOTFOUND" || code === "ETIMEDOUT";
}

export function getDbErrorPayload(err) {
  if (isDatabaseConnectionError(err)) {
    return { error: "Database unavailable, please retry", status: 503 };
  }
  return { error: "Internal server error", status: 500 };
}

async function clearCache() {
  if (cachedClient) {
    try {
      await cachedClient.close();
    } catch {}
  }
  cachedClient = null;
  cachedDb = null;
  cachedUri = null;
}

async function pingDb(db) {
  await db.command({ ping: 1 });
}

async function connectFresh() {
  const currentUri = process.env.MONGO_URL;
  if (!currentUri) {
    throw new DatabaseConnectionError("MONGO_URL is not configured");
  }

  const host = redactMongoHost(currentUri);
  console.log(`[db] Connecting to MongoDB host: ${host} (db: ${dbName})`);

  const client = new MongoClient(currentUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    await pingDb(db);
    cachedClient = client;
    cachedDb = db;
    cachedUri = currentUri;
    console.log(`[db] Connected to MongoDB host: ${host}`);
    return db;
  } catch (e) {
    try {
      await client.close();
    } catch {}
    const message = `Failed to connect to MongoDB (${host}): ${e?.message || e}`;
    console.error(`[db] ${message}`);
    throw new DatabaseConnectionError(message, e);
  }
}

export async function getDb() {
  const currentUri = process.env.MONGO_URL;

  if (cachedClient && cachedUri !== currentUri) {
    console.log("[db] MONGO_URL changed, closing old connection client...");
    await clearCache();
  }

  if (cachedDb) {
    try {
      await pingDb(cachedDb);
      return cachedDb;
    } catch (e) {
      console.warn("[db] Cached connection dead, reconnecting:", e?.message || e);
      await clearCache();
    }
  }

  return connectFresh();
}
