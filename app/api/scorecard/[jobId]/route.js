import { ImageResponse } from "next/og";
import { getDb } from "@/lib/solguard/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function levelColors(level) {
  switch (level) {
    case "CRITICAL": return { fg: "#f43f5e", bg: "rgba(244,63,94,0.15)" };
    case "HIGH":     return { fg: "#f97316", bg: "rgba(249,115,22,0.15)" };
    case "MEDIUM":   return { fg: "#f59e0b", bg: "rgba(245,158,11,0.15)" };
    default:         return { fg: "#10b981", bg: "rgba(16,185,129,0.15)" };
  }
}

export async function GET(request, { params }) {
  const { jobId } = await params;
  const db = await getDb();
  const doc = await db.collection("scans").findOne({ id: jobId }, { projection: { _id: 0 } });

  if (!doc || !doc.result) {
    return new ImageResponse(
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#09090b", color: "#fff" }}>Scan not found</div>,
      { width: 1200, height: 630 }
    );
  }

  const r = doc.result;
  const ai = (doc.aiSummary || "").slice(0, 320);
  const c = levelColors(r.riskLevel);
  const symbol = r.metadata?.symbol || "TOKEN";
  const name = (r.metadata?.name || "Unknown").slice(0, 28);
  const tokenAddr = r.tokenAddress;
  const score = r.riskScore;
  const level = r.riskLevel;
  const auth = r.authorityCheck;
  const bundle = r.bundleDetection;
  const liq = r.liquidityLock;

  const stats = [
    ["MINT AUTH", auth.mintAuthority, auth.mintAuthority === "REVOKED"],
    ["FREEZE AUTH", auth.freezeAuthority, auth.freezeAuthority === "REVOKED"],
    ["TOP HOLDER", `${(bundle.topHolderPercent || 0).toFixed(1)}%`, (bundle.topHolderPercent || 0) < 20],
    ["LIQUIDITY", liq.liquidityUsd ? `$${Math.round(liq.liquidityUsd).toLocaleString()}` : "NONE", liq.poolFound && (liq.liquidityUsd || 0) > 10000],
  ];

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0a0e0e", color: "#f4f4f5", padding: 44, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, letterSpacing: 4, fontWeight: 900, color: "#14b8a6" }}>SOLGUARD AI</div>
        <div style={{ display: "flex", padding: "10px 18px", border: `2px solid ${c.fg}`, background: c.bg, borderRadius: 10, color: c.fg, fontWeight: 900, fontSize: 22, letterSpacing: 3 }}>{level}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 900, color: "#fff" }}>{name}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#71717a", marginTop: 4 }}>{`$${symbol}`}</div>
          <div style={{ display: "flex", fontSize: 18, color: "#52525b", marginTop: 10, fontFamily: "monospace" }}>{tokenAddr}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 170, height: 170, borderRadius: 85, border: `6px solid ${c.fg}` }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 900, color: c.fg }}>{String(score)}</div>
          <div style={{ display: "flex", fontSize: 13, color: "#71717a", letterSpacing: 4, marginTop: 4 }}>RISK / 100</div>
        </div>
      </div>

      <div style={{ display: "flex", marginBottom: 18 }}>
        {stats.map(([label, value, ok], i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, padding: 16, marginRight: i < 3 ? 10 : 0, borderRadius: 12, border: `1px solid ${ok ? "#27272a" : "rgba(244,63,94,0.4)"}`, background: ok ? "rgba(24,24,27,0.6)" : "rgba(244,63,94,0.06)" }}>
            <div style={{ display: "flex", fontSize: 12, color: "#71717a", letterSpacing: 3 }}>{label}</div>
            <div style={{ display: "flex", fontSize: 22, color: ok ? "#10b981" : "#f43f5e", fontWeight: 800, marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: 22, borderRadius: 14, border: "1px solid rgba(20,184,166,0.4)", background: "rgba(20,184,166,0.06)", flex: 1 }}>
        <div style={{ display: "flex", fontSize: 13, color: "#14b8a6", letterSpacing: 4, marginBottom: 12 }}>AI SECURITY ASSESSMENT</div>
        <div style={{ display: "flex", fontSize: 22, color: "#e4e4e7", lineHeight: 1.4, fontStyle: "italic" }}>{ai}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 14, color: "#52525b", letterSpacing: 2 }}>
        <div style={{ display: "flex" }}>SCAN ANY SOLANA TOKEN FREE - solguard.ai</div>
        <div style={{ display: "flex" }}>{new Date(r.scannedAt).toISOString().slice(0, 16).replace("T", " ")}</div>
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
