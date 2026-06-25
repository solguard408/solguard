"use client";

import { useEffect, useState } from "react";
import {
  Shield, ShieldAlert, ShieldCheck, Search, Activity, Zap, Lock,
  AlertTriangle, CheckCircle2, XCircle, ArrowRight, Sparkles,
  Copy, ExternalLink, Loader2, Cpu, Layers, Droplets, Terminal
} from "lucide-react";

const EXAMPLE_TOKENS = [
  { label: "WSOL", addr: "So11111111111111111111111111111111111111112" },
  { label: "BONK", addr: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { label: "USDC", addr: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
];

function truncate(addr, n = 6) {
  if (!addr) return "";
  if (addr.length <= n * 2 + 3) return addr;
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

function isValidSol(a) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || ""); }

function levelColor(level) {
  switch (level) {
    case "CRITICAL": return { bg: "bg-rose-500", text: "text-rose-400", ring: "ring-rose-500/40", border: "border-rose-500/40", glow: "shadow-[0_0_30px_rgba(244,63,94,0.4)]" };
    case "HIGH": return { bg: "bg-orange-500", text: "text-orange-400", ring: "ring-orange-500/40", border: "border-orange-500/40", glow: "shadow-[0_0_25px_rgba(249,115,22,0.35)]" };
    case "MEDIUM": return { bg: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-400/40", border: "border-amber-400/40", glow: "shadow-[0_0_22px_rgba(245,158,11,0.3)]" };
    default: return { bg: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/40", border: "border-emerald-500/40", glow: "shadow-[0_0_25px_rgba(16,185,129,0.35)]" };
  }
}

function ScoreGauge({ score = 0, level = "LOW" }) {
  const c = levelColor(level);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += Math.max(1, Math.round((score - n) / 6));
      if (n >= score) { n = score; clearInterval(id); }
      setDisplay(n);
    }, 30);
    return () => clearInterval(id);
  }, [score]);
  const R = 56;
  const C = 2 * Math.PI * R;
  const offset = C - (display / 100) * C;
  const stroke = level === "CRITICAL" ? "#f43f5e" : level === "HIGH" ? "#f97316" : level === "MEDIUM" ? "#f59e0b" : "#10b981";
  return (
    <div className={`relative w-36 h-36 ${c.glow} rounded-full`}>
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={R} stroke="#27272a" strokeWidth="10" fill="none" />
        <circle cx="70" cy="70" r={R} stroke={stroke} strokeWidth="10" fill="none"
          strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.2s linear" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold ${c.text} terminal-text`}>{display}</div>
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Risk</div>
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const c = levelColor(level);
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md ${c.bg}/10 border ${c.border} ${c.text} terminal-text text-sm font-bold tracking-widest`}>
      <span className={`w-2 h-2 rounded-full ${c.bg} pulse-dot`} />
      {level}
    </div>
  );
}

function StatusPill({ ok, label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-md bg-zinc-900/60 border border-zinc-800">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-sm terminal-text font-semibold flex items-center gap-1.5 ${ok ? "text-emerald-400" : "text-rose-400"}`}>
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        {value}
      </span>
    </div>
  );
}

function ProgressBar({ value = 0, danger = false }) {
  const v = Math.min(100, Math.max(0, value));
  const color = v > 50 ? "bg-rose-500" : v > 20 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${v}%` }} />
    </div>
  );
}

function Header({ onLaunch }) {
  return (
    <header className="relative z-10 border-b border-zinc-800/60 backdrop-blur bg-[#09090b]/70">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Shield className="w-7 h-7 text-teal-400" />
            <div className="absolute inset-0 blur-md bg-teal-400/30 -z-10" />
          </div>
          <div className="terminal-text font-bold tracking-widest">
            SOLGUARD <span className="text-teal-400">AI</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 terminal-text">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            MAINNET // OPERATIONAL
          </div>
          <button onClick={onLaunch}
            className="px-4 py-2 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 transition text-sm terminal-text tracking-wider">
            LAUNCH TERMINAL →
          </button>
        </div>
      </div>
    </header>
  );
}

function Landing({ onStart }) {
  return (
    <div className="relative overflow-hidden">
      {/* gradient blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-teal-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -right-40 w-[520px] h-[520px] rounded-full bg-rose-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      <section className="relative max-w-7xl mx-auto px-5 pt-20 pb-24">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-500/5 text-teal-300 text-xs terminal-text tracking-widest mb-6">
            <Sparkles className="w-3.5 h-3.5" /> AUTONOMOUS SOLANA THREAT INTELLIGENCE
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight">
            DeFi Security Is Broken.<br/>
            <span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">We Audit Tokens Autonomously.</span>
          </h1>
          <p className="mt-6 text-zinc-400 max-w-2xl text-lg">
            Paste any Solana token mint. Get instant on-chain analysis of bundle launches, freeze authority abuse, holder concentration, and liquidity risk — backed by AI.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button onClick={onStart}
              className="px-7 py-3.5 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 transition terminal-text tracking-wider neon-glow flex items-center gap-2">
              INITIALIZE SCANNER <ArrowRight className="w-4 h-4" />
            </button>
            <a href="#features" className="px-7 py-3.5 rounded-md border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition terminal-text tracking-wider text-sm">
              VIEW CAPABILITIES
            </a>
          </div>
        </div>

        {/* Feature cards */}
        <div id="features" className="mt-24 grid sm:grid-cols-3 gap-4">
          {[
            { icon: Layers, title: "Bundle Detection", desc: "Identify coordinated wallet clustering and snipe bundles at token launch.", color: "teal" },
            { icon: Lock, title: "Authority Audit", desc: "Detect active mint and freeze authorities that let devs rug or freeze holders.", color: "rose" },
            { icon: Droplets, title: "Liquidity Guard", desc: "Verify pool liquidity, check burn status, and surface exit-risk warnings.", color: "amber" },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="group relative p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-teal-500/50 transition">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-teal-500/0 to-teal-500/0 group-hover:from-teal-500/5 transition" />
                <Icon className="w-7 h-7 text-teal-400 mb-4" />
                <h3 className="font-bold mb-2 terminal-text tracking-wider">{f.title.toUpperCase()}</h3>
                <p className="text-sm text-zinc-400">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="relative border-t border-zinc-800/60 mt-8">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between text-xs terminal-text text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            SYSTEM STATE: OPERATIONAL
          </div>
          <div>v0.1.0 • SOLGUARD AI © 2025</div>
        </div>
      </footer>
    </div>
  );
}

function Scanner({ onScanned, history, stats }) {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progressStep, setProgressStep] = useState(0);

  const valid = isValidSol(addr);

  useEffect(() => {
    if (!loading) { setProgressStep(0); return; }
    const id = setInterval(() => setProgressStep((s) => (s + 1) % 4), 900);
    return () => clearInterval(id);
  }, [loading]);

  async function runScan(target) {
    const a = (target || addr).trim();
    if (!isValidSol(a)) { setError("Invalid Solana address format"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: a }),
      });
      const data = await res.json();
      if (data.status === "FAILED") {
        setError(data.error || "Scan failed");
      } else {
        onScanned(data);
      }
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { label: "Authority Check", icon: Lock },
    { label: "Bundle Detection", icon: Layers },
    { label: "Liquidity Analysis", icon: Droplets },
    { label: "AI Risk Synthesis", icon: Sparkles },
  ];

  return (
    <div className="max-w-5xl mx-auto px-5 py-12 sm:py-16">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-500/5 text-teal-300 text-xs terminal-text tracking-widest mb-5">
          <Terminal className="w-3.5 h-3.5" /> TOKEN SECURITY SCANNER
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Audit Any Solana Token</h1>
        <p className="mt-3 text-zinc-400">Paste a token mint address for instant on-chain threat analysis.</p>
      </div>

      {/* Input */}
      <div className={`relative p-1 rounded-xl bg-zinc-900/60 border ${valid ? "border-teal-500/60 neon-glow" : "border-zinc-800"} transition`}>
        <div className="flex flex-col sm:flex-row gap-2 p-1">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Enter Solana token mint address..."
            className="flex-1 bg-transparent px-4 py-4 terminal-text text-zinc-100 placeholder-zinc-600 outline-none"
            disabled={loading}
          />
          <button
            onClick={() => runScan()}
            disabled={!valid || loading}
            className="px-6 py-3.5 rounded-lg bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed transition terminal-text tracking-wider flex items-center justify-center gap-2 min-w-[160px]"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> SCANNING</> : <><Search className="w-4 h-4" /> ANALYZE</>}
          </button>
        </div>
      </div>
      {error && <div className="mt-3 text-sm text-rose-400 terminal-text">⚠ {error}</div>}

      {/* Example chips */}
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-zinc-500 terminal-text">TRY:</span>
        {EXAMPLE_TOKENS.map((t) => (
          <button key={t.addr}
            onClick={() => { setAddr(t.addr); }}
            disabled={loading}
            className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/50 hover:bg-zinc-800/80 text-xs terminal-text text-zinc-300 transition">
            {t.label}
          </button>
        ))}
      </div>

      {/* Feature chips */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        <div className="px-3 py-2 rounded-md bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-teal-400" /> Authority</div>
        <div className="px-3 py-2 rounded-md bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-teal-400" /> Bundles</div>
        <div className="px-3 py-2 rounded-md bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2"><Droplets className="w-3.5 h-3.5 text-teal-400" /> Liquidity</div>
      </div>

      {/* Scanning state */}
      {loading && (
        <div className="mt-10 p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 relative overflow-hidden scanline">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <Shield className="w-16 h-16 text-teal-400" />
              <div className="absolute inset-0 blur-2xl bg-teal-400/40 -z-10" />
              <div className="absolute inset-0 rounded-full border-2 border-teal-400/40 animate-ping" />
            </div>
          </div>
          <div className="text-center terminal-text text-teal-300 mb-6">SCANNING TOKEN<span className="cursor-blink"></span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const active = i <= progressStep;
              return (
                <div key={i} className={`p-3 rounded-md border transition ${active ? "border-teal-500/50 bg-teal-500/5 text-teal-300" : "border-zinc-800 text-zinc-600"}`}>
                  <Icon className={`w-4 h-4 mb-1.5 ${active ? "text-teal-400" : "text-zinc-600"}`} />
                  <div className="text-xs terminal-text tracking-wider">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats + history */}
      {!loading && (
        <div className="mt-12 grid sm:grid-cols-3 gap-3">
          <StatCard label="Scans Executed" value={stats?.total ?? 0} color="text-teal-400" />
          <StatCard label="Threats Detected" value={stats?.threats ?? 0} color="text-rose-400" />
          <StatCard label="Node Latency" value={`${stats?.latency ?? 12}ms`} color="text-emerald-400" />
        </div>
      )}

      {!loading && history && history.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-teal-400" />
            <h2 className="terminal-text tracking-widest text-sm text-zinc-400">RECENT SCANS</h2>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            {history.slice(0, 6).map((h, i) => {
              const c = levelColor(h.riskLevel);
              return (
                <div key={h.id} className={`p-3 flex items-center justify-between hover:bg-zinc-900/60 transition ${i > 0 ? "border-t border-zinc-800" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Shield className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                    <div className="terminal-text text-sm text-zinc-300 truncate">{truncate(h.tokenAddress, 8)}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-zinc-500 hidden sm:block">{new Date(h.createdAt).toLocaleTimeString()}</div>
                    {h.riskLevel ? (
                      <div className={`px-2 py-0.5 rounded ${c.bg}/10 border ${c.border} ${c.text} text-xs terminal-text tracking-wider`}>
                        {h.riskLevel} {typeof h.riskScore === "number" ? `· ${h.riskScore}` : ""}
                      </div>
                    ) : (
                      <div className="px-2 py-0.5 rounded border border-zinc-800 text-zinc-500 text-xs terminal-text">{h.status}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800">
      <div className="text-xs terminal-text tracking-widest text-zinc-500">{label.toUpperCase()}</div>
      <div className={`text-3xl font-bold mt-1 terminal-text ${color}`}>{value}</div>
    </div>
  );
}

function ResultView({ scan, onBack }) {
  const r = scan?.result;
  const ai = scan?.aiSummary;
  const [copied, setCopied] = useState(false);
  if (!r) return null;

  const c = levelColor(r.riskLevel);
  const auth = r.authorityCheck;
  const bundle = r.bundleDetection;
  const liq = r.liquidityLock;

  async function share() {
    const txt = `🔍 SolGuard AI Analysis\n\nToken: ${truncate(r.tokenAddress, 8)}\nRisk: ${r.riskLevel} (${r.riskScore}/100)\n\n${ai}\n\nScan any Solana token free.`;
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <button onClick={onBack} className="text-xs terminal-text text-zinc-500 hover:text-teal-400 mb-6 flex items-center gap-1">
        ← BACK TO SCANNER
      </button>

      {/* Identity bar */}
      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6 mb-5">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {r.metadata?.image ? (
              <img src={r.metadata.image} alt="" className="w-16 h-16 rounded-xl border border-zinc-800 object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <div className="w-16 h-16 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                <Shield className="w-8 h-8 text-teal-400" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold truncate">
                  {r.metadata?.name || "Unknown Token"}{" "}
                  {r.metadata?.symbol && <span className="text-zinc-500 text-base">${r.metadata.symbol}</span>}
                </h2>
              </div>
              <div className="flex items-center gap-2 terminal-text text-xs text-zinc-500">
                <span className="truncate">{r.tokenAddress}</span>
                <a href={`https://solscan.io/token/${r.tokenAddress}`} target="_blank" rel="noreferrer" className="text-teal-400 hover:text-teal-300"><ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center">
              <ScoreGauge score={r.riskScore} level={r.riskLevel} />
              <div className="mt-3"><RiskBadge level={r.riskLevel} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-500/10 via-zinc-900/40 to-zinc-900/40 border border-teal-500/30 p-6 mb-5 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-400" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <h3 className="terminal-text text-sm tracking-widest text-teal-300">AI SECURITY ASSESSMENT</h3>
          </div>
          <button onClick={share} className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/50 hover:text-teal-300 transition flex items-center gap-1.5">
            <Copy className="w-3 h-3" /> {copied ? "COPIED!" : "SHARE"}
          </button>
        </div>
        <p className="text-zinc-200 leading-relaxed italic">{ai || "Generating AI assessment..."}</p>
        <div className="mt-3 text-[10px] terminal-text text-zinc-500 tracking-widest">POWERED BY GPT-4o-MINI</div>
      </div>

      {/* Cards grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Authority */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-teal-400" />
            <h3 className="terminal-text tracking-widest text-sm">CONTRACT AUTHORITY</h3>
          </div>
          <div className="space-y-2">
            <StatusPill ok={auth.mintAuthority === "REVOKED"} label="Mint Authority" value={auth.mintAuthority} />
            <StatusPill ok={auth.freezeAuthority === "REVOKED"} label="Freeze Authority" value={auth.freezeAuthority} />
          </div>
          {(auth.mintAuthority === "ACTIVE" || auth.freezeAuthority === "ACTIVE") ? (
            <div className="mt-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Developer retains control over this token.
            </div>
          ) : (
            <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" /> Authorities safely revoked.
            </div>
          )}
        </div>

        {/* Bundle */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-teal-400" />
            <h3 className="terminal-text tracking-widest text-sm">LAUNCH BUNDLE ANALYSIS</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Bundle Detected</span>
              <span className={`terminal-text font-bold ${bundle.detected ? "text-rose-400" : "text-emerald-400"}`}>{bundle.detected ? "YES" : "NO"}</span>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5"><span className="text-zinc-400">Top Holder</span><span className="terminal-text text-zinc-200">{bundle.topHolderPercent.toFixed(1)}%</span></div>
              <ProgressBar value={bundle.topHolderPercent} />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5"><span className="text-zinc-400">Top 10 Concentration</span><span className="terminal-text text-zinc-200">{bundle.top10Percent.toFixed(1)}%</span></div>
              <ProgressBar value={bundle.top10Percent} />
            </div>
            {bundle.earlySlotClustering && (
              <div className="mt-2 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Coordinated wallet clustering detected.
              </div>
            )}
          </div>
        </div>

        {/* Liquidity */}
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <Droplets className="w-4 h-4 text-teal-400" />
            <h3 className="terminal-text tracking-widest text-sm">LIQUIDITY SECURITY</h3>
          </div>
          <div className="space-y-2">
            <StatusPill ok={liq.poolFound} label="DEX Pool" value={liq.poolFound ? "FOUND" : "NONE"} />
            <div className="flex items-center justify-between py-2.5 px-3 rounded-md bg-zinc-900/60 border border-zinc-800">
              <span className="text-sm text-zinc-400">Liquidity (USD)</span>
              <span className="text-sm terminal-text font-semibold text-zinc-200">
                {liq.liquidityUsd !== null ? `$${Math.round(liq.liquidityUsd).toLocaleString()}` : "—"}
              </span>
            </div>
          </div>
          {!liq.poolFound && (
            <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> No active DEX pool detected.
            </div>
          )}
        </div>
      </div>

      {/* Risk factors */}
      <div className="mt-5 p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4 text-teal-400" />
          <h3 className="terminal-text tracking-widest text-sm">ACTIVE RISK VECTORS</h3>
        </div>
        {r.riskFactors && r.riskFactors.length > 0 ? (
          <ul className="space-y-2">
            {r.riskFactors.map((f, i) => (
              <li key={i} className="flex gap-3 p-3 rounded-md bg-zinc-900/60 border border-zinc-800">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-zinc-300">{f}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" /> No critical risk vectors detected.
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-xs terminal-text text-zinc-600">
        SCANNED AT {new Date(r.scannedAt).toUTCString()}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("landing"); // landing | scanner | result
  const [scan, setScan] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  async function refreshData() {
    try {
      const [hRes, sRes] = await Promise.all([
        fetch("/api/scans").then((r) => r.json()),
        fetch("/api/stats").then((r) => r.json()),
      ]);
      setHistory(hRes.scans || []);
      setStats(sRes);
    } catch {}
  }

  useEffect(() => { refreshData(); }, [view]);

  return (
    <div className="min-h-screen">
      <Header onLaunch={() => setView("scanner")} />
      {view === "landing" && <Landing onStart={() => setView("scanner")} />}
      {view === "scanner" && (
        <Scanner
          onScanned={(s) => { setScan(s); setView("result"); refreshData(); }}
          history={history}
          stats={stats}
        />
      )}
      {view === "result" && <ResultView scan={scan} onBack={() => setView("scanner")} />}
    </div>
  );
}
