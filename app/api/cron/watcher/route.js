import { NextResponse } from "next/server";
import { tick } from "@/lib/solguard/watcher";
import { initializeDatabase } from "@/lib/solguard/initDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  // Verify Vercel Cron signature to ensure request comes from Vercel's scheduler
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron] Executing watcher tick...");
    await initializeDatabase();
    await tick();
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("[cron] Watcher tick error:", e?.message);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
