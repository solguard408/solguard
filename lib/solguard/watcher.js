// Background loop that re-scans watched tokens and emits alerts when risk level changes.
import { getDb } from "./mongo";
import { runTokenScan } from "./scanEngine";

const INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
let started = false;

export async function tick() {
  try {
    const db = await getDb();
    const watches = await db.collection("watchlist").find({}).toArray();
    // de-dupe by tokenAddress so we scan each once per cycle
    const tokens = [...new Set(watches.map((w) => w.tokenAddress))];
    for (const tokenAddress of tokens) {
      try {
        const scan = await runTokenScan(tokenAddress);
        const last = await db.collection("watch_state").findOne({ tokenAddress });
        const prevLevel = last?.riskLevel || null;
        await db.collection("watch_state").updateOne(
          { tokenAddress },
          { $set: { tokenAddress, riskLevel: scan.riskLevel, riskScore: scan.riskScore, metadata: scan.metadata, updatedAt: new Date() } },
          { upsert: true }
        );
        if (prevLevel && prevLevel !== scan.riskLevel) {
          // emit one alert per watcher of this token
          const watchers = watches.filter((w) => w.tokenAddress === tokenAddress);
          for (const w of watchers) {
            await db.collection("alerts").insertOne({
              id: crypto.randomUUID(),
              userId: w.userId,
              tokenAddress,
              previousLevel: prevLevel,
              newLevel: scan.riskLevel,
              riskScore: scan.riskScore,
              symbol: scan.metadata?.symbol || null,
              createdAt: new Date(),
              read: false,
            });
          }
        }
      } catch (e) {
        // skip failed scans
      }
    }
  } catch (e) {
    console.error("watcher tick error:", e?.message);
  }
}

export function startWatcher() {
  if (started) return;
  started = true;
  // first tick after 30s then every INTERVAL_MS
  setTimeout(tick, 30 * 1000);
  setInterval(tick, INTERVAL_MS);
  console.log("[watcher] started");
}
