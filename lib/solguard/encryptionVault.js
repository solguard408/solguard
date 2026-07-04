import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./mongo";

const ALGORITHM = "aes-256-gcm";
const KEY_LABEL = "High-grade symmetric encryption (AES-256-GCM) — not post-quantum";

function deriveKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return crypto.scryptSync(secret, "solguard-vault-v1", 32);
}

export function encryptPayload(plaintext) {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    algorithm: ALGORITHM,
  };
}

export function decryptPayload({ ciphertext, iv, tag }) {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export async function storeEncryptedRecord(plaintext, userId) {
  const enc = encryptPayload(plaintext);
  const recordId = uuidv4();
  const createdAt = new Date();
  const db = await getDb();
  await db.collection("encryption_vault").insertOne({
    id: recordId,
    userId,
    ...enc,
    keyLabel: KEY_LABEL,
    createdAt,
  });
  return {
    recordId,
    decryptUrl: `/api/vault/${recordId}`,
    algorithm: ALGORITHM,
    keyLabel: KEY_LABEL,
    createdAt: createdAt.toISOString(),
  };
}

export async function retrieveEncryptedRecord(recordId, userId) {
  const db = await getDb();
  const doc = await db.collection("encryption_vault").findOne({ id: recordId });
  if (!doc) return { error: "Record not found" };
  if (doc.userId !== userId) return { error: "Unauthorized" };
  try {
    const plaintext = decryptPayload(doc);
    return {
      recordId,
      plaintext,
      algorithm: doc.algorithm,
      keyLabel: doc.keyLabel,
      createdAt: doc.createdAt,
    };
  } catch {
    return { error: "Decryption failed" };
  }
}
