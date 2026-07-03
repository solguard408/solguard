import { MongoClient } from "mongodb";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const client = await MongoClient.connect(env.MONGO_URL);
const db = client.db(env.DB_NAME || "solguard");
const now = Date.now();
const last30 = new Date(now - 30 * 86400000);
const todayStart = new Date(now);
todayStart.setHours(0, 0, 0, 0);
const reports = db.collection("reports");
const rawAll = await reports.countDocuments({});
const rawToday = await reports.countDocuments({ createdAt: { $gte: todayStart } });
const rawThreats = await reports.countDocuments({ "result.riskLevel": { $in: ["HIGH", "CRITICAL"] } });
const distinct = await reports
  .aggregate([
    { $match: { createdAt: { $gte: last30 } } },
    { $group: { _id: "$agentId" } },
    { $count: "count" },
  ])
  .toArray();
const BASELINE = { scansToday: 10, scansAllTime: 22, threats: 7, agentsUsedLast30Days: 2 };
const api = await fetch("http://localhost:3001/api/stats/overall").then((r) => r.json());
console.log(
  JSON.stringify(
    {
      mongodb: {
        rawAll,
        rawToday,
        rawThreats,
        rawDistinctAgents30d: distinct[0]?.count ?? 0,
      },
      baseline: BASELINE,
      apiDisplayed: {
        total: api.total,
        today: api.today,
        threats: api.threats,
        agentsUsedLast30Days: api.agentsUsedLast30Days,
        agentsTotal: api.agentsTotal,
      },
      matchesBaselineFormula: {
        total: api.total === Math.max(BASELINE.scansAllTime, rawAll),
        today: api.today === Math.max(BASELINE.scansToday, rawToday),
        threats: api.threats === Math.max(BASELINE.threats, rawThreats),
        agentsUsed30d: api.agentsUsedLast30Days === Math.max(BASELINE.agentsUsedLast30Days, distinct[0]?.count ?? 0),
      },
    },
    null,
    2
  )
);
await client.close();
