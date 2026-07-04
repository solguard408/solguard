import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./mongo";

const ALGORITHM = "sha256-salted-commitment";

function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return secret;
}

function computeCommitment(salt, data) {
  return crypto.createHash("sha256").update(`${salt}:${data}`, "utf8").digest("hex");
}

function signProof(proofId, commitment) {
  return crypto.createHmac("sha256", signingKey()).update(`${proofId}:${commitment}`).digest("hex");
}

/** Creates a proof record — stores commitment + salt only, never the raw payload. */
export async function createIntegrityProof(data, userId) {
  const salt = crypto.randomBytes(16).toString("hex");
  const commitment = computeCommitment(salt, data);
  const proofId = uuidv4();
  const signature = signProof(proofId, commitment);
  const createdAt = new Date();

  const db = await getDb();
  await db.collection("integrity_proofs").insertOne({
    id: proofId,
    commitment,
    salt,
    signature,
    algorithm: ALGORITHM,
    userId: userId || null,
    createdAt,
  });

  return {
    proofId,
    proofUrl: `/verify/${proofId}`,
    commitment,
    algorithm: ALGORITHM,
    createdAt: createdAt.toISOString(),
  };
}

export async function getProofMetadata(proofId) {
  const db = await getDb();
  const doc = await db.collection("integrity_proofs").findOne(
    { id: proofId },
    { projection: { _id: 0, salt: 0, commitment: 0, signature: 0 } }
  );
  if (!doc) return null;
  return {
    proofId: doc.id,
    algorithm: doc.algorithm,
    createdAt: doc.createdAt,
    note: "Raw data is not stored — submit your copy locally to verify it matches the commitment.",
  };
}

export async function verifyIntegrityProof(proofId, data) {
  const db = await getDb();
  const doc = await db.collection("integrity_proofs").findOne({ id: proofId });
  if (!doc) return { ok: false, error: "Proof not found" };

  const expectedSig = signProof(proofId, doc.commitment);
  if (expectedSig !== doc.signature) {
    return { ok: false, error: "Proof record integrity check failed" };
  }

  const candidate = computeCommitment(doc.salt, data);
  const matched = candidate === doc.commitment;
  return {
    ok: true,
    matched,
    algorithm: doc.algorithm,
    verifiedAt: new Date().toISOString(),
  };
}
