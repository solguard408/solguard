import jwt from "jsonwebtoken";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { getDb } from "./mongo";

const SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidCliInstallId(id) {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

export function verifySolanaSignature(walletAddress, message, signatureB58) {
  try {
    const sig = bs58.decode(signatureB58);
    const pub = bs58.decode(walletAddress);
    const msg = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch (e) { return false; }
}

// Auth from request: returns user doc or null
export async function getAuthUser(request) {
  const db = await getDb();
  const auth = request.headers.get("authorization") || "";
  const apiKey = request.headers.get("x-api-key") || "";

  if (auth.startsWith("Bearer ")) {
    const tok = auth.slice(7);
    const payload = verifyToken(tok);
    if (payload?.userId) {
      const user = await db.collection("users").findOne({ id: payload.userId });
      if (user) return { user, via: "jwt" };
    }
  }
  if (apiKey) {
    const key = await db.collection("apikeys").findOne({ key: apiKey, isActive: true });
    if (key) {
      const user = await db.collection("users").findOne({ id: key.userId });
      if (user) {
        await db.collection("apikeys").updateOne({ key: apiKey }, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } });
        return { user, via: "apikey" };
      }
    }
  }
  return null;
}
