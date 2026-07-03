import { NextResponse } from "next/server";
import { getDbErrorPayload, isDatabaseConnectionError } from "./mongo";

export function jsonDbError(err) {
  const { error, status } = getDbErrorPayload(err);
  if (isDatabaseConnectionError(err)) {
    console.error("[api] Database unavailable:", err?.message || err);
  } else {
    console.error("[api] Database error:", err?.message || err);
  }
  return NextResponse.json({ error }, { status });
}

export async function withDb(handler) {
  try {
    const { getDb } = await import("./mongo");
    const db = await getDb();
    return await handler(db);
  } catch (err) {
    return jsonDbError(err);
  }
}
