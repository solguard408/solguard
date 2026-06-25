"use client";

import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import {
  Shield, ShieldAlert, ShieldCheck, Search, Activity, Lock,
  AlertTriangle, CheckCircle2, XCircle, ArrowRight, Sparkles,
  Copy, ExternalLink, Loader2, Layers, Droplets, Terminal,
  Wallet, LogOut, Bell, Star, Trash2, Key, Plus, Image as ImageIcon,
  Twitter, Download,
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
    case "CRITICAL": return { bg: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/40", glow: "shadow-[0_0_30px_rgba(244,63,94,0.4)]" };
    case "HIGH": return { bg: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/40", glow: "shadow-[0_0_25px_rgba(249,115,22,0.35)]" };
    case "MEDIUM": return { bg: "bg-amber-400", text: "text-amber-300", border: "border-amber-400/40", glow: "shadow-[0_0_22px_rgba(245,158,11,0.3)]" };
    default: return { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/40", glow: "shadow-[0_0_25px_rgba(16,185,129,0.35)]" };
  }
}

// ---- API helper with auth header ----
function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) },
  });
  let data; try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ===========================================================
// Components
// ===========================================================
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
    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-zinc-900 border ${c.border} ${c.text} terminal-text text-sm font-bold tracking-widest`}>
      <span className={`w-2 h-2 rounded-full ${c.bg} pulse-dot`} /> {level}
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

function ProgressBar({ value = 0 }) {
  const v = Math.min(100, Math.max(0, value));
  const color = v > 50 ? "bg-rose-500" : v > 20 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${v}%` }} />
    </div>
  );
}

// ===========================================================
// Toast / Alert system
// ===========================================================
function Toast({ alert, onClose }) {
  const c = levelColor(alert.newLevel);
  return (
    <div className={`pointer-events-auto p-4 rounded-xl border ${c.border} bg-zinc-900/95 backdrop-blur shadow-2xl ${c.glow} min-w-[320px] max-w-md`}>
      <div className="flex items-start gap-3">
        <Bell className={`w-5 h-5 ${c.text} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <div className="terminal-text text-xs tracking-widest text-zinc-500">RISK LEVEL CHANGED</div>
          <div className={`font-bold ${c.text} mt-1`}>
            {alert.symbol || truncate(alert.tokenAddress)}: {alert.previousLevel} → {alert.newLevel}
          </div>
          <div className="text-xs text-zinc-500 mt-1 terminal-text">{truncate(alert.tokenAddress, 8)}</div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><XCircle className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ===========================================================
// Wallet Connect (Phantom)
// ===========================================================
function WalletButton({ user, onAuth, onLogout }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setError("");
    try {
      const provider = typeof window !== "undefined" ? window.solana : null;
      if (!provider || !provider.isPhantom) {
        setError("Phantom wallet not detected. Install Phantom: https://phantom.app");
        return;
      }
      setConnecting(true);
      const resp = await provider.connect();
      const walletAddress = resp.publicKey.toString();
      // request nonce
      const n = await api("/api/auth/nonce", { method: "POST", body: JSON.stringify({ walletAddress }) });
      if (!n.ok) throw new Error(n.data?.error || "Nonce error");
      const { message, nonce } = n.data;
      const encoded = new TextEncoder().encode(message);
      const signed = await provider.signMessage(encoded, "utf8");
      const signature = bs58.encode(signed.signature);
      const v = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ walletAddress, signature, nonce }) });
      if (!v.ok) throw new Error(v.data?.error || "Verify failed");
      localStorage.setItem("sg_token", v.data.token);
      onAuth(v.data.user);
    } catch (e) {
      setError(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs terminal-text">
          <span className="text-emerald-400">●</span>
          <span className="text-zinc-300">{truncate(user.walletAddress)}</span>
          <span className="text-zinc-600 mx-1">·</span>
          <span className="text-teal-400">{user.credits} credits</span>
        </div>
        <button onClick={onLogout} title="Disconnect" className="p-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-rose-500/40 hover:text-rose-400 transition">
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <button onClick={connect} disabled={connecting}
        className="px-4 py-2 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-50 transition text-sm terminal-text tracking-wider flex items-center gap-2">
        <Wallet className="w-4 h-4" /> {connecting ? "CONNECTING..." : "CONNECT WALLET"}
      </button>
      {error && <div className="text-xs text-rose-400 mt-1 max-w-xs">{error}</div>}
    </div>
  );
}

// ===========================================================
// Header
// ===========================================================
function Header({ view, setView, user, onAuth, onLogout, alertCount }) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/60 backdrop-blur bg-[#09090b]/70">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <button onClick={() => setView("landing")} className="flex items-center gap-2.5">
            <div className="relative">
              <Shield className="w-7 h-7 text-teal-400" />
              <div className="absolute inset-0 blur-md bg-teal-400/30 -z-10" />
            </div>
            <div className="terminal-text font-bold tracking-widest hidden sm:block">
              SOLGUARD <span className="text-teal-400">AI</span>
            </div>
          </button>
          <nav className="hidden md:flex items-center gap-1 text-xs terminal-text">
            <NavBtn active={view === "scanner"} onClick={() => setView("scanner")}>SCANNER</NavBtn>
            {user && <NavBtn active={view === "watchlist"} onClick={() => setView("watchlist")}>
              WATCHLIST {alertCount > 0 && <span className="ml-1.5 px-1.5 rounded bg-rose-500 text-black text-[10px]">{alertCount}</span>}
            </NavBtn>}
            {user && <NavBtn active={view === "billing"} onClick={() => setView("billing")}>API KEYS</NavBtn>}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <WalletButton user={user} onAuth={onAuth} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
function NavBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-md tracking-widest transition ${active ? "bg-teal-500/10 text-teal-300 border border-teal-500/30" : "text-zinc-500 hover:text-zinc-300"}`}>
      {children}
    </button>
  );
}

// ===========================================================
// Landing
// ===========================================================
function Landing({ onStart }) {
  return (
    <div className="relative overflow-hidden">
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
            Paste any Solana token mint. Get instant on-chain analysis of bundle launches, freeze authority abuse, holder concentration, and liquidity risk — backed by AI. Watch tokens and get real-time alerts when their risk level changes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button onClick={onStart}
              className="px-7 py-3.5 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 transition terminal-text tracking-wider neon-glow flex items-center gap-2">
              INITIALIZE SCANNER <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-24 grid sm:grid-cols-3 gap-4">
          {[
            { icon: Layers, title: "Bundle Detection", desc: "Identify coordinated wallet clustering and snipe bundles at token launch." },
            { icon: Lock, title: "Authority Audit", desc: "Detect active mint and freeze authorities that let devs rug or freeze holders." },
            { icon: Bell, title: "Real-Time Alerts", desc: "Add tokens to your watchlist and get instant alerts when risk level changes." },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-teal-500/50 transition">
                <Icon className="w-7 h-7 text-teal-400 mb-4" />
                <h3 className="font-bold mb-2 terminal-text tracking-wider">{f.title.toUpperCase()}</h3>
                <p className="text-sm text-zinc-400">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ===========================================================
// Scanner
// ===========================================================
function Scanner({ user, onScanned, history, stats, onAddWatch }) {
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

  async function runScan() {
    if (!valid) { setError("Invalid Solana address format"); return; }
    setError(""); setLoading(true);
    try {
      const r = await api("/api/scan", { method: "POST", body: JSON.stringify({ tokenAddress: addr.trim() }) });
      if (r.data?.status === "FAILED") setError(r.data.error || "Scan failed");
      else if (!r.ok) setError(r.data?.error || "Scan failed");
      else onScanned(r.data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
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

      <div className={`relative p-1 rounded-xl bg-zinc-900/60 border ${valid ? "border-teal-500/60 neon-glow" : "border-zinc-800"} transition`}>
        <div className="flex flex-col sm:flex-row gap-2 p-1">
          <input value={addr} onChange={(e) => setAddr(e.target.value)}
            placeholder="Enter Solana token mint address..."
            className="flex-1 bg-transparent px-4 py-4 terminal-text text-zinc-100 placeholder-zinc-600 outline-none" disabled={loading} />
          <button onClick={runScan} disabled={!valid || loading}
            className="px-6 py-3.5 rounded-lg bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed transition terminal-text tracking-wider flex items-center justify-center gap-2 min-w-[160px]">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> SCANNING</> : <><Search className="w-4 h-4" /> ANALYZE</>}
          </button>
        </div>
      </div>
      {error && <div className="mt-3 text-sm text-rose-400 terminal-text">⚠ {error}</div>}

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-zinc-500 terminal-text">TRY:</span>
        {EXAMPLE_TOKENS.map((t) => (
          <button key={t.addr} onClick={() => setAddr(t.addr)} disabled={loading}
            className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/50 text-xs terminal-text text-zinc-300 transition">{t.label}</button>
        ))}
      </div>

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

      {!loading && (
        <div className="mt-12 grid sm:grid-cols-3 gap-3">
          <StatCard label="Scans Executed" value={stats?.total ?? 0} color="text-teal-400" />
          <StatCard label="Threats Detected" value={stats?.threats ?? 0} color="text-rose-400" />
          <StatCard label="Node Latency" value={`${stats?.latency ?? 12}ms`} color="text-emerald-400" />
        </div>
      )}

      {!loading && history?.length > 0 && (
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
                  <div className="flex items-center gap-3">
                    {user && h.riskLevel && (
                      <button onClick={() => onAddWatch(h.tokenAddress)}
                        title="Add to watchlist"
                        className="text-zinc-600 hover:text-amber-400 transition">
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    {h.riskLevel ? (
                      <div className={`px-2 py-0.5 rounded bg-zinc-900 border ${c.border} ${c.text} text-xs terminal-text tracking-wider`}>
                        {h.riskLevel} · {h.riskScore}
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

// ===========================================================
// Result View — with scorecard PNG share
// ===========================================================
function ResultView({ scan, onBack, user, onAddWatch }) {
  const r = scan?.result;
  const ai = scan?.aiSummary;
  const [copied, setCopied] = useState(false);
  if (!r) return null;
  const auth = r.authorityCheck;
  const bundle = r.bundleDetection;
  const liq = r.liquidityLock;
  const scorecardUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/scorecard/${scan.jobId}`;

  async function copyShare() {
    const txt = `🔍 SolGuard AI Analysis\n\nToken: ${truncate(r.tokenAddress, 8)}\nRisk: ${r.riskLevel} (${r.riskScore}/100)\n\n${ai}\n\nFull scan: ${scorecardUrl}`;
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  }

  const tweetText = encodeURIComponent(`🔍 SolGuard AI scanned ${r.metadata?.symbol ? "$" + r.metadata.symbol : truncate(r.tokenAddress, 6)}\n\nRisk: ${r.riskLevel} (${r.riskScore}/100)\n\n${(ai || "").slice(0, 180)}\n\nScan any Solana token free 👇`);
  const tweetIntent = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(scorecardUrl)}`;

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <button onClick={onBack} className="text-xs terminal-text text-zinc-500 hover:text-teal-400 mb-6 flex items-center gap-1">
        ← BACK TO SCANNER
      </button>

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
                  {r.metadata?.name || "Unknown"}{" "}
                  {r.metadata?.symbol && <span className="text-zinc-500 text-base">${r.metadata.symbol}</span>}
                </h2>
              </div>
              <div className="flex items-center gap-2 terminal-text text-xs text-zinc-500">
                <span className="truncate">{r.tokenAddress}</span>
                <a href={`https://solscan.io/token/${r.tokenAddress}`} target="_blank" rel="noreferrer" className="text-teal-400 hover:text-teal-300"><ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {user && (
                  <button onClick={() => onAddWatch(r.tokenAddress)}
                    className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 hover:text-amber-300 transition flex items-center gap-1.5">
                    <Star className="w-3 h-3" /> WATCH
                  </button>
                )}
                <a href={tweetIntent} target="_blank" rel="noreferrer"
                  className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/50 hover:text-teal-300 transition flex items-center gap-1.5">
                  <Twitter className="w-3 h-3" /> POST TO X
                </a>
                <a href={scorecardUrl} download={`solguard-${truncate(r.tokenAddress, 4)}.png`}
                  className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/50 hover:text-teal-300 transition flex items-center gap-1.5">
                  <Download className="w-3 h-3" /> PNG
                </a>
                <button onClick={copyShare}
                  className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/50 hover:text-teal-300 transition flex items-center gap-1.5">
                  <Copy className="w-3 h-3" /> {copied ? "COPIED!" : "COPY"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ScoreGauge score={r.riskScore} level={r.riskLevel} />
            <div className="mt-3"><RiskBadge level={r.riskLevel} /></div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-teal-500/10 via-zinc-900/40 to-zinc-900/40 border border-teal-500/30 p-6 mb-5 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-400" />
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <h3 className="terminal-text text-sm tracking-widest text-teal-300">AI SECURITY ASSESSMENT</h3>
        </div>
        <p className="text-zinc-200 leading-relaxed italic">{ai || "Generating AI assessment..."}</p>
        <div className="mt-3 text-[10px] terminal-text text-zinc-500 tracking-widest">POWERED BY GPT-4o-MINI</div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4"><Lock className="w-4 h-4 text-teal-400" /><h3 className="terminal-text tracking-widest text-sm">CONTRACT AUTHORITY</h3></div>
          <div className="space-y-2">
            <StatusPill ok={auth.mintAuthority === "REVOKED"} label="Mint Authority" value={auth.mintAuthority} />
            <StatusPill ok={auth.freezeAuthority === "REVOKED"} label="Freeze Authority" value={auth.freezeAuthority} />
          </div>
          {(auth.mintAuthority === "ACTIVE" || auth.freezeAuthority === "ACTIVE") ? (
            <div className="mt-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> Developer retains control over this token.</div>
          ) : (
            <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex gap-2"><ShieldCheck className="w-4 h-4 flex-shrink-0" /> Authorities safely revoked.</div>
          )}
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4"><Layers className="w-4 h-4 text-teal-400" /><h3 className="terminal-text tracking-widest text-sm">LAUNCH BUNDLE ANALYSIS</h3></div>
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
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4"><Droplets className="w-4 h-4 text-teal-400" /><h3 className="terminal-text tracking-widest text-sm">LIQUIDITY SECURITY</h3></div>
          <div className="space-y-2">
            <StatusPill ok={liq.poolFound} label="DEX Pool" value={liq.poolFound ? "FOUND" : "NONE"} />
            <div className="flex items-center justify-between py-2.5 px-3 rounded-md bg-zinc-900/60 border border-zinc-800">
              <span className="text-sm text-zinc-400">Liquidity (USD)</span>
              <span className="text-sm terminal-text font-semibold text-zinc-200">{liq.liquidityUsd !== null ? `$${Math.round(liq.liquidityUsd).toLocaleString()}` : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="flex items-center gap-2 mb-4"><ShieldAlert className="w-4 h-4 text-teal-400" /><h3 className="terminal-text tracking-widest text-sm">ACTIVE RISK VECTORS</h3></div>
        {r.riskFactors?.length > 0 ? (
          <ul className="space-y-2">
            {r.riskFactors.map((f, i) => (
              <li key={i} className="flex gap-3 p-3 rounded-md bg-zinc-900/60 border border-zinc-800">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-zinc-300">{f}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex gap-2"><ShieldCheck className="w-4 h-4 flex-shrink-0" /> No critical risk vectors detected.</div>
        )}
      </div>

      {/* Scorecard preview */}
      <div className="mt-5 p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="flex items-center gap-2 mb-4"><ImageIcon className="w-4 h-4 text-teal-400" /><h3 className="terminal-text tracking-widest text-sm">SHAREABLE SCORECARD</h3></div>
        <img src={scorecardUrl} alt="scorecard" className="w-full rounded-lg border border-zinc-800" />
      </div>
    </div>
  );
}

// ===========================================================
// Watchlist
// ===========================================================
function Watchlist({ user, onScan }) {
  const [items, setItems] = useState([]);
  const [addr, setAddr] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    const r = await api("/api/watchlist");
    if (r.ok) setItems(r.data.items || []);
  }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  async function add() {
    if (!isValidSol(addr)) { setError("Invalid address"); return; }
    setError(""); setAdding(true);
    const r = await api("/api/watchlist", { method: "POST", body: JSON.stringify({ tokenAddress: addr.trim() }) });
    setAdding(false);
    if (!r.ok) setError(r.data?.error || "Failed"); else { setAddr(""); load(); }
  }
  async function remove(a) {
    await api(`/api/watchlist/${encodeURIComponent(a)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-teal-400" />
        <h1 className="text-3xl font-bold">Watchlist</h1>
      </div>
      <p className="text-zinc-400 mb-6">Add Solana tokens to monitor. We re-scan every 3 minutes and alert you when risk level changes.</p>

      <div className="flex gap-2 mb-6">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Token mint address"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-4 py-3 terminal-text text-sm outline-none focus:border-teal-500/60" />
        <button onClick={add} disabled={adding || !isValidSol(addr)}
          className="px-5 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-40 terminal-text tracking-wider text-sm flex items-center gap-2">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} ADD
        </button>
      </div>
      {error && <div className="text-rose-400 text-sm mb-4">⚠ {error}</div>}

      {items.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-zinc-500">
          No tokens in watchlist yet. Add a Solana token mint above.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
          {items.map((it, i) => {
            const lvl = it.state?.riskLevel || "PENDING";
            const c = levelColor(lvl);
            return (
              <div key={it.tokenAddress} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-zinc-800" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {it.state?.metadata?.image ? (
                    <img src={it.state.metadata.image} className="w-9 h-9 rounded-md border border-zinc-800 object-cover" onError={(e) => e.target.style.display = "none"} />
                  ) : <Shield className="w-9 h-9 text-zinc-700 p-1.5 rounded-md border border-zinc-800" />}
                  <div>
                    <div className="font-bold text-sm">{it.state?.metadata?.name || truncate(it.tokenAddress)} <span className="text-zinc-500">{it.state?.metadata?.symbol ? `$${it.state.metadata.symbol}` : ""}</span></div>
                    <div className="text-xs terminal-text text-zinc-600">{truncate(it.tokenAddress, 8)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {it.state?.riskLevel ? (
                    <div className={`px-2.5 py-1 rounded bg-zinc-900 border ${c.border} ${c.text} text-xs terminal-text tracking-wider`}>{lvl} · {it.state.riskScore}</div>
                  ) : (
                    <div className="px-2.5 py-1 rounded border border-zinc-800 text-zinc-500 text-xs terminal-text">SCANNING…</div>
                  )}
                  <button onClick={() => onScan(it.tokenAddress)} className="p-2 rounded text-zinc-500 hover:text-teal-400 transition" title="Re-scan">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(it.tokenAddress)} className="p-2 rounded text-zinc-500 hover:text-rose-400 transition" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================
// Billing / API Keys
// ===========================================================
function Billing({ user }) {
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await api("/api/keys");
    if (r.ok) setKeys(r.data.keys || []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setCreating(true);
    const r = await api("/api/keys", { method: "POST", body: JSON.stringify({ label: label || "Default" }) });
    setCreating(false);
    if (r.ok) { setNewKey(r.data.key); setLabel(""); load(); }
  }
  async function revoke(id) {
    await api(`/api/keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-10">
      <div className="flex items-center gap-2 mb-6">
        <Key className="w-5 h-5 text-teal-400" />
        <h1 className="text-3xl font-bold">API Keys & Credits</h1>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Plan" value={user?.plan || "FREE"} color="text-teal-400" />
        <StatCard label="Credits Remaining" value={user?.credits ?? 0} color="text-emerald-400" />
        <StatCard label="Active Keys" value={keys.filter(k => k.isActive).length} color="text-amber-400" />
      </div>

      <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/30 mb-5">
        <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-3">CREATE NEW API KEY</h3>
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Production bot)"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2.5 text-sm outline-none focus:border-teal-500/60" />
          <button onClick={create} disabled={creating}
            className="px-4 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-40 terminal-text tracking-wider text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> CREATE
          </button>
        </div>
        {newKey && (
          <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <div className="text-xs terminal-text text-emerald-300 mb-2">⚠ COPY THIS NOW — IT WON'T BE SHOWN AGAIN</div>
            <div className="font-mono text-sm bg-zinc-900 p-2 rounded break-all">{newKey}</div>
            <button onClick={() => { navigator.clipboard.writeText(newKey); setNewKey(null); }}
              className="mt-2 text-xs terminal-text text-teal-300 hover:text-teal-200">COPY & DISMISS</button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        {keys.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No API keys yet. Create one above.</div>
        ) : keys.map((k, i) => (
          <div key={k.id} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-zinc-800" : ""} ${!k.isActive ? "opacity-50" : ""}`}>
            <div>
              <div className="font-bold">{k.label}</div>
              <div className="text-xs font-mono text-zinc-500 mt-1">{k.key}</div>
              <div className="text-xs text-zinc-600 mt-1 terminal-text">Used {k.usageCount}× · Created {new Date(k.createdAt).toLocaleDateString()}</div>
            </div>
            {k.isActive ? (
              <button onClick={() => revoke(k.id)} className="text-xs px-3 py-1.5 rounded-md border border-zinc-800 hover:border-rose-500/40 hover:text-rose-400 transition flex items-center gap-1.5">
                <Trash2 className="w-3 h-3" /> REVOKE
              </button>
            ) : <span className="text-xs text-zinc-500 terminal-text">REVOKED</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================
// Root App
// ===========================================================
export default function App() {
  const [view, setView] = useState("landing");
  const [scan, setScan] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [user, setUser] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const sseRef = useRef(null);

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
  async function refreshMe() {
    if (typeof window === "undefined") return;
    const tok = localStorage.getItem("sg_token");
    if (!tok) return;
    const r = await api("/api/me");
    if (r.ok) setUser(r.data);
    else { localStorage.removeItem("sg_token"); setUser(null); }
  }

  useEffect(() => { refreshData(); refreshMe(); }, []);
  useEffect(() => { refreshData(); }, [view]);

  // SSE alerts subscription
  useEffect(() => {
    if (!user) return;
    const tok = localStorage.getItem("sg_token");
    if (!tok) return;
    const es = new EventSource(`/api/alerts/stream?token=${encodeURIComponent(tok)}`);
    sseRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "alert") {
          const id = msg.alert.id;
          setToasts((t) => [...t, msg.alert]);
          setAlertCount((c) => c + 1);
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
        }
      } catch {}
    };
    es.onerror = () => { /* silently retry */ };
    return () => es.close();
  }, [user]);

  async function addToWatchlist(tokenAddress) {
    if (!user) { alert("Connect wallet to use watchlist"); return; }
    await api("/api/watchlist", { method: "POST", body: JSON.stringify({ tokenAddress }) });
  }

  function logout() { localStorage.removeItem("sg_token"); setUser(null); setView("landing"); }

  return (
    <div className="min-h-screen">
      <Header view={view} setView={(v) => { setView(v); if (v === "watchlist") setAlertCount(0); }}
        user={user} onAuth={(u) => { setUser(u); setView("scanner"); }} onLogout={logout}
        alertCount={alertCount} />

      {view === "landing" && <Landing onStart={() => setView("scanner")} />}
      {view === "scanner" && <Scanner user={user} onScanned={(s) => { setScan(s); setView("result"); refreshData(); }} history={history} stats={stats} onAddWatch={addToWatchlist} />}
      {view === "result" && <ResultView scan={scan} onBack={() => setView("scanner")} user={user} onAddWatch={addToWatchlist} />}
      {view === "watchlist" && user && <Watchlist user={user} onScan={async (a) => {
        const r = await api("/api/scan", { method: "POST", body: JSON.stringify({ tokenAddress: a }) });
        if (r.data?.status === "COMPLETED") { setScan(r.data); setView("result"); }
      }} />}
      {view === "billing" && user && <Billing user={user} />}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-none flex flex-col gap-2">
        {toasts.map((a) => (
          <Toast key={a.id} alert={a} onClose={() => setToasts((t) => t.filter((x) => x.id !== a.id))} />
        ))}
      </div>
    </div>
  );
}
