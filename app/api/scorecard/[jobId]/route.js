import { ImageResponse } from "next/og";
import { getDb } from "@/lib/solguard/mongo";
import { jsonDbError } from "@/lib/solguard/dbRoute";
import { loadBrandFont, loadLogoBase64, BRAND_FONT_NAME } from "@/lib/solguard/brandAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function levelColors(level) {
  switch (level) {
    case "CRITICAL": return { fg: "#f43f5e", bg: "rgba(244,63,94,0.12)" };
    case "HIGH":     return { fg: "#f97316", bg: "rgba(249,115,22,0.12)" };
    case "MEDIUM":   return { fg: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
    default:         return { fg: "#10b981", bg: "rgba(16,185,129,0.12)" };
  }
}

export async function GET(request, { params }) {
  try {
    return await renderScorecard(request, params);
  } catch (e) {
    return jsonDbError(e);
  }
}

async function renderScorecard(request, { params }) {
  const { jobId } = await params;
  const db = await getDb();
  const doc = await db.collection("scans").findOne({ id: jobId }, { projection: { _id: 0 } });

  if (!doc || !doc.result) {
    const fontData = await loadBrandFont();
    return new ImageResponse(
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#F8FAFC", color: "#1E293B", alignItems: "center", justifyContent: "center", fontFamily: BRAND_FONT_NAME }}>Scan not found</div>,
      {
        width: 1200,
        height: 630,
        fonts: [{ name: BRAND_FONT_NAME, data: fontData, style: "normal", weight: 700 }],
      },
    );
  }

  const [logoBase64, fontData] = await Promise.all([loadLogoBase64(), loadBrandFont()]);

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
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#F8FAFC", color: "#1E293B", padding: 44, fontFamily: BRAND_FONT_NAME }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src={`data:image/png;base64,${logoBase64}`} width={56} height={56} alt="" />
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 1.5, fontWeight: 700, color: "#1E40AF", textTransform: "uppercase" }}>SolGuard AI</div>
        </div>
        <div style={{ display: "flex", padding: "10px 18px", border: `2px solid ${c.fg}`, background: c.bg, borderRadius: 10, color: c.fg, fontWeight: 900, fontSize: 22, letterSpacing: 3 }}>{level}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 900, color: "#0F172A" }}>{name}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#64748B", marginTop: 4 }}>{`$${symbol}`}</div>
          <div style={{ display: "flex", fontSize: 18, color: "#94A3B8", marginTop: 10, fontFamily: BRAND_FONT_NAME }}>{tokenAddr}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 170, height: 170, borderRadius: 85, border: `6px solid ${c.fg}`, background: "#FFFFFF" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 900, color: c.fg }}>{String(score)}</div>
          <div style={{ display: "flex", fontSize: 13, color: "#64748B", letterSpacing: 4, marginTop: 4 }}>RISK / 100</div>
        </div>
      </div>

      <div style={{ display: "flex", marginBottom: 18 }}>
        {stats.map(([label, value, ok], i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, padding: 16, marginRight: i < 3 ? 10 : 0, borderRadius: 12, border: `1px solid ${ok ? "#E2E8F0" : "rgba(244,63,94,0.35)"}`, background: ok ? "#FFFFFF" : "rgba(244,63,94,0.04)" }}>
            <div style={{ display: "flex", fontSize: 12, color: "#64748B", letterSpacing: 3 }}>{label}</div>
            <div style={{ display: "flex", fontSize: 22, color: ok ? "#10b981" : "#f43f5e", fontWeight: 800, marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: 22, borderRadius: 14, border: "1px solid #BFDBFE", background: "#EFF6FF", flex: 1 }}>
        <div style={{ display: "flex", fontSize: 13, color: "#2563EB", letterSpacing: 4, marginBottom: 12 }}>AI SECURITY ASSESSMENT</div>
        <div style={{ display: "flex", fontSize: 22, color: "#334155", lineHeight: 1.4, fontStyle: "italic" }}>{ai}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 14, color: "#94A3B8", letterSpacing: 2 }}>
        <div style={{ display: "flex" }}>SCAN ANY SOLANA TOKEN FREE - solguard.ai</div>
        <div style={{ display: "flex" }}>{new Date(r.scannedAt).toISOString().slice(0, 16).replace("T", " ")}</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [{ name: BRAND_FONT_NAME, data: fontData, style: "normal", weight: 700 }],
    },
  );
}
