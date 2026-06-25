"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import bs58 from "bs58";
import {
  Shield, ShieldAlert, ShieldCheck, Search, Lock, AlertTriangle, CheckCircle2, XCircle,
  ArrowRight, Sparkles, Copy, ExternalLink, Loader2, Layers, Droplets, Wallet, LogOut, Bell,
  Star, Trash2, Key, Plus, Twitter, Download, Coins, Users, FileText, TrendingUp, Activity,
  Globe, MessageSquare, UserCog, ChevronRight, Filter, Zap, Book, Code2, CreditCard, BarChart3,
  CircleDollarSign, Flame, Clock, X, Send,
} from "lucide-react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";

// --- icon map (server returns icon name as string)
const ICONS = { Coins, Lock, Layers, Users, Droplets, FileText, Sparkles, ShieldAlert, TrendingUp, Activity, Globe, Wallet, UserCog, Shield, MessageSquare };

const isValidSol = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || "");
const truncate = (a, n = 6) => !a ? "" : (a.length <= n * 2 + 3 ? a : `${a.slice(0, n)}…${a.slice(-n)}`);

function levelColor(level) {
  switch (level) {
    case "CRITICAL": return { bg: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/40", glow: "shadow-[0_0_30px_rgba(244,63,94,0.4)]", hex: "#f43f5e" };
    case "HIGH": return { bg: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/40", glow: "shadow-[0_0_25px_rgba(249,115,22,0.35)]", hex: "#f97316" };
    case "MEDIUM": return { bg: "bg-amber-400", text: "text-amber-300", border: "border-amber-400/40", glow: "shadow-[0_0_22px_rgba(245,158,11,0.3)]", hex: "#f59e0b" };
    default: return { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/40", glow: "shadow-[0_0_25px_rgba(16,185,129,0.35)]", hex: "#10b981" };
  }
}
function categoryColor(cat) {
  const m = { Token: "teal", Wallet: "violet", Liquidity: "cyan", Market: "amber", Social: "sky", Web: "emerald", AI: "rose", Advisory: "fuchsia" };
  return m[cat] || "teal";
}

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) } });
  let data; try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ===================== UI PRIMITIVES =====================
function ScoreGauge({ score = 0, level = "LOW", size = "lg" }) {
  const c = levelColor(level);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let n = 0; const id = setInterval(() => { n += Math.max(1, Math.round((score - n) / 6)); if (n >= score) { n = score; clearInterval(id); } setDisplay(n); }, 30);
    return () => clearInterval(id);
  }, [score]);
  const R = 56; const C = 2 * Math.PI * R; const offset = C - (display / 100) * C;
  const dim = size === "sm" ? "w-24 h-24" : "w-36 h-36";
  const fs = size === "sm" ? "text-2xl" : "text-4xl";
  return (
    <div className={`relative ${dim} ${c.glow} rounded-full`}>
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={R} stroke="#27272a" strokeWidth="10" fill="none" />
        <circle cx="70" cy="70" r={R} stroke={c.hex} strokeWidth="10" fill="none" strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.2s linear" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`${fs} font-bold ${c.text} terminal-text`}>{display}</div>
        <div className="text-[10px] tracking-widest text-zinc-500 uppercase">Risk</div>
      </div>
    </div>
  );
}
function RiskBadge({ level }) {
  const c = levelColor(level);
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-md bg-zinc-900 border ${c.border} ${c.text} terminal-text text-xs font-bold tracking-widest`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.bg} pulse-dot`} /> {level}
    </div>
  );
}
function StatCard({ label, value, color = "text-teal-400", sub }) {
  return (
    <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800">
      <div className="text-xs terminal-text tracking-widest text-zinc-500">{label.toUpperCase()}</div>
      <div className={`text-3xl font-bold mt-1 terminal-text ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

// ===================== USDC PAYMENT (Phantom) =====================
const HELIUS_RPC = "/api"; // proxy not needed; we use direct RPC URL fetched from server
async function sendUsdcPayment({ amountUsdc, walletProvider }) {
  // Get config from server
  const cfg = await api("/api/payment/config");
  if (!cfg.ok) throw new Error("Could not fetch payment config");
  const { mint, destWallet } = cfg.data;

  // Use a public Solana RPC for browser-side tx (no Helius key exposure)
  const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const payer = new PublicKey(walletProvider.publicKey.toString());
  const mintPk = new PublicKey(mint);
  const destPk = new PublicKey(destWallet);

  const srcAta = await getAssociatedTokenAddress(mintPk, payer);
  const destAta = await getAssociatedTokenAddress(mintPk, destPk);

  const ixs = [];
  // Ensure destination ATA exists
  try { await getAccount(conn, destAta); } catch (e) { ixs.push(createAssociatedTokenAccountInstruction(payer, destAta, destPk, mintPk)); }

  const amountRaw = BigInt(Math.round(amountUsdc * 1_000_000)); // USDC has 6 decimals
  ixs.push(createTransferCheckedInstruction(srcAta, mintPk, destAta, payer, amountRaw, 6));

  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const signed = await walletProvider.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

// ===================== PAYMENT MODAL =====================
function PaymentModal({ open, onClose, agent, user, onConfirm, busy, error }) {
  const [choice, setChoice] = useState("usdc");
  const hasCredits = (user?.credits || 0) > 0;
  const hasSub = !!user?.subscription;

  useEffect(() => {
    if (hasCredits) setChoice("credit");
    else if (hasSub) setChoice("subscription");
    else setChoice("usdc");
  }, [open, hasCredits, hasSub]);

  if (!open || !agent) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={onClose}>
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-6 neon-glow" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-teal-400 terminal-text tracking-widest mb-1">CONFIRM ANALYSIS</div>
            <h3 className="text-xl font-bold">{agent.name}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2 mb-5">
          {hasCredits && (
            <PayOption icon={<Star className="w-4 h-4" />} active={choice === "credit"} onClick={() => setChoice("credit")}
              title="Use Free Credit" sub={`${user.credits} remaining`} priceText="FREE" />
          )}
          {hasSub && (
            <PayOption icon={<Zap className="w-4 h-4" />} active={choice === "subscription"} onClick={() => setChoice("subscription")}
              title={`${user.subscription.plan.toUpperCase()} Subscription`} sub={user.subscription.quota === -1 ? "Unlimited" : `${user.subscription.remaining} analyses left`} priceText="INCLUDED" />
          )}
          <PayOption icon={<CircleDollarSign className="w-4 h-4" />} active={choice === "usdc"} onClick={() => setChoice("usdc")}
            title="Pay with USDC" sub="Sent on Solana mainnet" priceText={`$${agent.price.toFixed(2)}`} />
        </div>

        {choice === "usdc" && (
          <div className="text-xs text-zinc-500 mb-4 p-3 rounded-md bg-zinc-900 border border-zinc-800">
            You'll sign a transaction sending {agent.price} USDC to
            <div className="font-mono text-teal-400 break-all mt-1">AnBTwJ…GTiZ3</div>
            Verification happens on-chain before the agent runs.
          </div>
        )}

        {error && <div className="text-sm text-rose-400 mb-3 p-3 rounded-md bg-rose-500/10 border border-rose-500/20">⚠ {error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-3 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition terminal-text tracking-wider text-sm">CANCEL</button>
          <button onClick={() => onConfirm(choice)} disabled={busy}
            className="flex-[2] px-4 py-3 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-50 transition terminal-text tracking-wider text-sm flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {choice === "usdc" ? "WAITING FOR SIGNATURE…" : "RUNNING…"}</> : <>CONFIRM & RUN <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
function PayOption({ icon, active, onClick, title, sub, priceText }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between p-3 rounded-lg border transition ${active ? "border-teal-500/60 bg-teal-500/5" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md ${active ? "bg-teal-500/20 text-teal-300" : "bg-zinc-800 text-zinc-400"}`}>{icon}</div>
        <div className="text-left">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-zinc-500">{sub}</div>
        </div>
      </div>
      <div className={`terminal-text text-sm font-bold ${active ? "text-teal-300" : "text-zinc-400"}`}>{priceText}</div>
    </button>
  );
}

// ===================== HEADER / NAV =====================
function Header({ view, setView, user, onConnect, onLogout, connecting, walletError }) {
  const nav = [
    { id: "explorer", label: "Explorer" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "guide", label: "Guide" },
    { id: "watchlist", label: "Watchlist", auth: true },
    { id: "api", label: "API" },
    { id: "dashboard", label: "Dashboard", auth: true },
    { id: "exploits", label: "Exploit Watch" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/60 backdrop-blur bg-[#09090b]/80">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
        <button onClick={() => setView("home")} className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative"><Shield className="w-7 h-7 text-teal-400" /><div className="absolute inset-0 blur-md bg-teal-400/30 -z-10" /></div>
          <div className="terminal-text font-bold tracking-widest hidden sm:block">SOLGUARD <span className="text-teal-400">AI</span></div>
        </button>
        <nav className="hidden lg:flex items-center gap-0.5 text-xs terminal-text flex-1 justify-center">
          {nav.filter((n) => !n.auth || user).map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`px-3 py-1.5 rounded-md tracking-widest transition ${view === n.id || view.startsWith(n.id + ":") ? "bg-teal-500/10 text-teal-300 border border-teal-500/30" : "text-zinc-500 hover:text-zinc-200 border border-transparent"}`}>
              {n.label.toUpperCase()}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs terminal-text">
                <span className="text-emerald-400">●</span>
                <span className="text-zinc-300">{truncate(user.walletAddress)}</span>
                <span className="text-zinc-700">·</span>
                <span className="text-teal-400">{user.credits} cr</span>
                {user.subscription && <><span className="text-zinc-700">·</span><span className="text-amber-300">{user.subscription.plan}</span></>}
              </div>
              <button onClick={onLogout} className="p-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-rose-500/40 hover:text-rose-400"><LogOut className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <button onClick={onConnect} disabled={connecting}
              className="px-4 py-2 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-50 transition text-sm terminal-text tracking-wider flex items-center gap-2">
              <Wallet className="w-4 h-4" /> {connecting ? "CONNECTING…" : "CONNECT"}
            </button>
          )}
        </div>
      </div>
      {walletError && <div className="text-xs text-rose-400 max-w-7xl mx-auto px-5 pb-2">{walletError}</div>}
      <nav className="lg:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 text-[11px] terminal-text border-t border-zinc-900">
        {nav.filter((n) => !n.auth || user).map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${view === n.id || view.startsWith(n.id + ":") ? "bg-teal-500/10 text-teal-300" : "text-zinc-500"}`}>
            {n.label.toUpperCase()}
          </button>
        ))}
      </nav>
    </header>
  );
}

// ===================== HOME =====================
function Home({ agents, setView, overallStats, exploits }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-teal-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -right-40 w-[520px] h-[520px] rounded-full bg-rose-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <section className="relative max-w-7xl mx-auto px-5 pt-16 pb-20">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-500/5 text-teal-300 text-xs terminal-text tracking-widest mb-6">
            <Sparkles className="w-3.5 h-3.5" /> MARKETPLACE OF AI SECURITY AGENTS
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight">
            DeFi Security Is Broken.<br/>
            <span className="bg-gradient-to-r from-teal-300 to-emerald-400 bg-clip-text text-transparent">We Built Specialized AI Auditors For It.</span>
          </h1>
          <p className="mt-6 text-zinc-400 max-w-2xl text-lg">
            SolGuard isn't one scanner. It's a marketplace of 16+ specialized AI security agents. Pick the exact analysis you need. Pay only $0.10 USDC per run — or subscribe.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button onClick={() => setView("explorer")}
              className="px-7 py-3.5 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 transition terminal-text tracking-wider neon-glow flex items-center gap-2">
              EXPLORE SECURITY AGENTS <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => setView("subscriptions")} className="px-7 py-3.5 rounded-md border border-zinc-800 hover:border-teal-500/40 hover:text-teal-300 transition terminal-text tracking-wider text-sm">VIEW SUBSCRIPTIONS</button>
          </div>
        </div>

        {/* live stats strip */}
        {overallStats && (
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-4xl mx-auto">
            <StatCard label="Analyses Today" value={overallStats.today ?? 0} color="text-teal-400" />
            <StatCard label="Total Analyses" value={overallStats.total ?? 0} color="text-emerald-400" />
            <StatCard label="Threats Detected" value={overallStats.threats ?? 0} color="text-rose-400" />
            <StatCard label="Active Agents" value={`${overallStats.agentsActive ?? 16}/16`} color="text-amber-400" />
          </div>
        )}
      </section>

      {/* Agents Marketplace preview */}
      <section className="relative max-w-7xl mx-auto px-5 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Featured Agents</h2>
            <p className="text-zinc-500 text-sm mt-1">Specialized AI security services — pick what you need.</p>
          </div>
          <button onClick={() => setView("explorer")} className="text-xs terminal-text text-teal-400 hover:text-teal-300 tracking-widest flex items-center gap-1">VIEW ALL → </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.slice(0, 6).map((a) => <AgentCard key={a.id} agent={a} onOpen={() => setView(`agent:${a.id}`)} />)}
        </div>
      </section>

      {/* Exploit Watch teaser */}
      {exploits && exploits.length > 0 && (
        <section className="relative max-w-7xl mx-auto px-5 pb-20">
          <div className="rounded-2xl bg-gradient-to-br from-rose-500/5 to-zinc-900/40 border border-rose-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30"><Flame className="w-5 h-5 text-rose-400" /></div>
                <div>
                  <div className="flex items-center gap-2"><h3 className="font-bold text-lg">Exploit Watch</h3><span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500 text-black terminal-text">LIVE</span></div>
                  <div className="text-xs text-zinc-500">Real-world Solana exploits — real losses.</div>
                </div>
              </div>
              <button onClick={() => setView("exploits")} className="text-xs terminal-text text-rose-400 hover:text-rose-300">VIEW FEED →</button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {exploits.slice(0, 3).map((e) => (
                <div key={e.id} className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm">{e.project}</div>
                    <div className="text-rose-400 terminal-text text-sm font-bold">${(e.lossUsd / 1_000_000).toFixed(1)}M</div>
                  </div>
                  <div className="text-xs text-zinc-500 mb-1">{e.vector} · {e.chain}</div>
                  <div className="text-xs text-zinc-400 line-clamp-2">{e.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ===================== AGENT CARD =====================
function AgentCard({ agent, onOpen }) {
  const Icon = ICONS[agent.icon] || Shield;
  return (
    <button onClick={onOpen} className="group text-left p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 hover:border-teal-500/50 hover:bg-zinc-900/70 transition-all flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400"><Icon className="w-5 h-5" /></div>
        <div className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 terminal-text tracking-widest">{agent.category.toUpperCase()}</div>
      </div>
      <h3 className="font-bold mb-2 text-lg">{agent.name}</h3>
      <p className="text-sm text-zinc-400 line-clamp-3 mb-4 flex-1">{agent.description}</p>
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <div>
          <div className="text-xl font-bold terminal-text">${agent.price.toFixed(2)} <span className="text-xs text-zinc-500 font-normal">USDC</span></div>
          <div className="text-[10px] text-zinc-500 terminal-text tracking-wider">{agent.estimatedTime} · {agent.supportedChains.join(", ")}</div>
        </div>
        <div className="text-teal-400 group-hover:translate-x-1 transition-transform"><ChevronRight className="w-5 h-5" /></div>
      </div>
    </button>
  );
}

// ===================== EXPLORER =====================
function Explorer({ agents, setView }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const cats = ["ALL", ...Array.from(new Set(agents.map((a) => a.category)))];
  const filtered = agents.filter((a) => (cat === "ALL" || a.category === cat) && (!q || a.name.toLowerCase().includes(q.toLowerCase()) || a.description.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="max-w-7xl mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold">Agent Marketplace</h1>
        <p className="text-zinc-500 mt-2">Specialized AI security agents — pick the exact analysis you need.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-4 py-3 text-sm outline-none focus:border-teal-500/60" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-2 rounded-md text-xs terminal-text tracking-wider whitespace-nowrap border ${cat === c ? "bg-teal-500/10 border-teal-500/40 text-teal-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-700"}`}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((a) => <AgentCard key={a.id} agent={a} onOpen={() => setView(`agent:${a.id}`)} />)}
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-zinc-500">No agents match.</div>}
    </div>
  );
}

// ===================== AGENT DETAIL & RUNNER =====================
function AgentPage({ agentId, user, ensureWallet, onReport, setView }) {
  const [agent, setAgent] = useState(null);
  const [inputs, setInputs] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      const r = await api(`/api/agents/${agentId}`);
      if (r.ok) { setAgent(r.data); const init = {}; r.data.inputs.forEach((i) => init[i.key] = ""); setInputs(init); }
      const rep = await api("/api/reports");
      if (rep.ok) setRecent((rep.data.reports || []).filter((x) => x.agentId === agentId).slice(0, 5));
    })();
  }, [agentId]);

  if (!agent) return <div className="max-w-5xl mx-auto px-5 py-20 text-center text-zinc-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  const Icon = ICONS[agent.icon] || Shield;
  const allFilled = agent.inputs.every((i) => inputs[i.key] && inputs[i.key].trim().length > 0);

  function start() { setError(""); if (!user) { ensureWallet(); return; } setPayOpen(true); }

  async function confirmPayment(choice) {
    setBusy(true); setError("");
    try {
      let paymentSignature = null;
      if (choice === "usdc") {
        const provider = typeof window !== "undefined" ? window.solana : null;
        if (!provider?.isPhantom) throw new Error("Phantom wallet not detected");
        if (!provider.isConnected) await provider.connect();
        paymentSignature = await sendUsdcPayment({ amountUsdc: agent.price, walletProvider: provider });
      }
      const r = await api(`/api/agents/${agent.id}/run`, { method: "POST", body: JSON.stringify({ inputs, paymentMethod: choice, paymentSignature }) });
      if (!r.ok) throw new Error(r.data?.error || "Run failed");
      setPayOpen(false);
      onReport(r.data);
    } catch (e) {
      setError(e?.message || "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <button onClick={() => setView("explorer")} className="text-xs terminal-text text-zinc-500 hover:text-teal-400 mb-6">← BACK TO MARKETPLACE</button>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* header */}
          <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400"><Icon className="w-7 h-7" /></div>
              <div className="flex-1">
                <div className="text-xs text-zinc-500 terminal-text tracking-widest mb-1">{agent.category.toUpperCase()} AGENT</div>
                <h1 className="text-3xl font-bold mb-1">{agent.name}</h1>
                <p className="text-zinc-400">{agent.description}</p>
              </div>
            </div>
            {agent.longDescription && <p className="text-sm text-zinc-400 leading-relaxed border-t border-zinc-800 pt-4">{agent.longDescription}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              {agent.supportedChains.map((c) => (
                <span key={c} className="text-xs terminal-text px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {c}
                </span>
              ))}
            </div>
          </div>

          {/* features */}
          <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6">
            <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-3">CAPABILITIES</h3>
            <ul className="grid sm:grid-cols-2 gap-2">
              {agent.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* inputs */}
          <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6">
            <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-4">INPUTS</h3>
            {agent.inputs.map((i) => (
              <div key={i.key} className="mb-4">
                <label className="text-xs terminal-text text-zinc-500 mb-1.5 block">{i.label}</label>
                {i.multiline ? (
                  <textarea value={inputs[i.key] || ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })}
                    placeholder={i.placeholder} rows={4}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm terminal-text outline-none focus:border-teal-500/60" />
                ) : (
                  <input value={inputs[i.key] || ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })}
                    placeholder={i.placeholder}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm terminal-text outline-none focus:border-teal-500/60" />
                )}
                {i.example && <button onClick={() => setInputs({ ...inputs, [i.key]: i.example })} className="text-[11px] text-teal-400 hover:text-teal-300 mt-1">Use example →</button>}
              </div>
            ))}
            {error && <div className="text-sm text-rose-400 mb-3">⚠ {error}</div>}
            <button onClick={start} disabled={!allFilled || busy}
              className="w-full px-6 py-3 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-40 transition terminal-text tracking-wider flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {user ? "START ANALYSIS" : "CONNECT WALLET TO RUN"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-5">
            <div className="text-xs terminal-text tracking-widest text-zinc-500 mb-2">PRICE</div>
            <div className="text-4xl font-bold terminal-text">${agent.price.toFixed(2)}</div>
            <div className="text-xs text-zinc-500 mt-1">per analysis · USDC on Solana</div>
            <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">Est. time</span><span className="terminal-text">{agent.estimatedTime}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Free credit</span><span className="terminal-text text-emerald-400">{user?.credits || 0} left</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Subscription</span><span className="terminal-text">{user?.subscription ? user.subscription.plan : "none"}</span></div>
            </div>
          </div>

          {recent.length > 0 && (
            <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-5">
              <div className="text-xs terminal-text tracking-widest text-zinc-500 mb-3">YOUR RECENT REPORTS</div>
              <div className="space-y-1">
                {recent.map((r) => (
                  <button key={r.id} onClick={() => setView(`report:${r.id}`)} className="w-full text-left p-2 rounded hover:bg-zinc-900 transition flex items-center justify-between text-xs">
                    <div className="text-zinc-400 truncate">{Object.values(r.inputs).join(" · ").slice(0, 30)}</div>
                    <RiskBadge level={r.result.riskLevel} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} agent={agent} user={user} onConfirm={confirmPayment} busy={busy} error={error} />
    </div>
  );
}

// ===================== REPORT VIEW =====================
function ReportView({ report, setView }) {
  const [copied, setCopied] = useState(false);
  if (!report) return <div className="text-center py-20 text-zinc-500">No report.</div>;
  const r = report.result || report;
  const c = levelColor(r.riskLevel);

  function copy() {
    const txt = `🔍 SolGuard AI · ${report.agentName || report.agentId}\nRisk: ${r.riskLevel} (${r.riskScore}/100)\n\n${r.summary}\n\nsolguard.ai`;
    navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800);
  }
  function dl() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `solguard-${report.reportId || report.id}.json`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <button onClick={() => setView("explorer")} className="text-xs terminal-text text-zinc-500 hover:text-teal-400 mb-6">← BACK TO EXPLORER</button>

      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6 mb-5">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
          <div className="flex-1">
            <div className="text-xs text-teal-400 terminal-text tracking-widest mb-2">AGENT REPORT</div>
            <h1 className="text-3xl font-bold mb-2">{report.agentName || report.agentId}</h1>
            <div className="text-sm text-zinc-400 mb-3">Input: <span className="terminal-text text-zinc-300">{Object.values(report.inputs || {}).join(", ")}</span></div>
            <div className="flex gap-2">
              <button onClick={copy} className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/40 transition flex items-center gap-1.5"><Copy className="w-3 h-3" /> {copied ? "COPIED" : "COPY"}</button>
              <button onClick={dl} className="text-xs terminal-text px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-teal-500/40 transition flex items-center gap-1.5"><Download className="w-3 h-3" /> JSON</button>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ScoreGauge score={r.riskScore || 0} level={r.riskLevel || "LOW"} />
            <div className="mt-3"><RiskBadge level={r.riskLevel || "LOW"} /></div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-teal-500/10 to-zinc-900/40 border border-teal-500/30 p-6 mb-5 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-400" />
        <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-teal-400" /><h3 className="terminal-text text-sm tracking-widest text-teal-300">SUMMARY</h3></div>
        <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{r.summary}</p>
      </div>

      {r.recommendations?.length > 0 && (
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6 mb-5">
          <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-4">RECOMMENDATIONS</h3>
          <ul className="space-y-2">{r.recommendations.map((x, i) => <li key={i} className="flex gap-3 p-3 rounded bg-zinc-900/60 border border-zinc-800 text-sm"><AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />{x}</li>)}</ul>
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6">
        <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-4">EVIDENCE (RAW)</h3>
        <pre className="text-xs terminal-text text-zinc-400 overflow-auto max-h-96 p-3 bg-zinc-950 rounded border border-zinc-800">{JSON.stringify(r.evidence, null, 2)}</pre>
      </div>
    </div>
  );
}

// ===================== SUBSCRIPTIONS =====================
function Subscriptions({ user, ensureWallet, onSubscribed }) {
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/api/subscriptions/plans").then((r) => r.ok && setPlans(r.data.plans)); }, []);

  async function subscribe(plan) {
    setError("");
    if (!user) { ensureWallet(); return; }
    if (plan.custom) { setError("Contact sales for Business plan: hello@solguard.ai"); return; }
    setBusy(plan.id);
    try {
      const provider = window.solana;
      if (!provider?.isPhantom) throw new Error("Phantom wallet not detected");
      if (!provider.isConnected) await provider.connect();
      const sig = await sendUsdcPayment({ amountUsdc: plan.priceUsdc, walletProvider: provider });
      const r = await api("/api/subscriptions/subscribe", { method: "POST", body: JSON.stringify({ plan: plan.id, paymentSignature: sig }) });
      if (!r.ok) throw new Error(r.data?.error || "Subscription failed");
      onSubscribed(r.data.subscription);
    } catch (e) { setError(e?.message || "Subscription failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl sm:text-5xl font-bold">Subscriptions</h1>
        <p className="text-zinc-400 mt-3 max-w-2xl mx-auto">Prefer not to pay per call? Subscribe once and access every AI agent at a flat rate. Pay in USDC on Solana.</p>
      </div>

      {error && <div className="text-rose-400 text-sm text-center mb-4">⚠ {error}</div>}

      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const popular = p.popular;
          return (
            <div key={p.id} className={`relative rounded-2xl p-6 ${popular ? "bg-gradient-to-br from-teal-500/15 to-zinc-900/40 border-2 border-teal-500/50 neon-glow" : "bg-zinc-900/40 border border-zinc-800"}`}>
              {popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-teal-500 text-black text-xs terminal-text font-bold tracking-widest">POPULAR</div>}
              <div className="text-center mb-6">
                <div className="text-zinc-400 terminal-text tracking-widest text-sm mb-2">{p.name.toUpperCase()}</div>
                <div className="text-5xl font-bold">{p.custom ? "Custom" : `$${p.priceUsdc}`}<span className="text-base text-zinc-500">/mo</span></div>
                <div className="text-zinc-400 mt-2">{p.quota === -1 ? "Unlimited analyses" : `${p.quota.toLocaleString()} analyses / 30 days`}</div>
                {p.quota > 0 && <div className="text-xs text-zinc-500 mt-1">≈ ${(p.priceUsdc / p.quota).toFixed(3)} per analysis</div>}
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> Access to all 16 AI agents</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> Real-time watchlist alerts</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> Report history & exports</li>
                {p.id !== "starter" && <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> Priority RPC routing</li>}
                {p.id === "business" && <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-teal-400" /> Dedicated SLA</li>}
              </ul>
              <button onClick={() => subscribe(p)} disabled={busy === p.id}
                className={`w-full px-4 py-3 rounded-md font-bold terminal-text tracking-wider transition ${popular ? "bg-teal-500 text-black hover:bg-teal-400" : "bg-zinc-900 border border-zinc-700 hover:border-teal-500/50"} disabled:opacity-50 flex items-center justify-center gap-2`}>
                {busy === p.id ? <><Loader2 className="w-4 h-4 animate-spin" /> PROCESSING…</> : p.custom ? "CONTACT SALES" : "SUBSCRIBE"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 max-w-3xl mx-auto p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <h3 className="font-bold mb-3">How a subscription works</h3>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal pl-5">
          <li>Pay once in USDC on Solana — verified on-chain.</li>
          <li>Quota credited to your connected wallet for 30 days.</li>
          <li>Run any of the 16 agents — quota decreases by 1 per analysis.</li>
          <li>Subscription does not auto-renew. Top up anytime.</li>
        </ol>
      </div>
    </div>
  );
}

// ===================== GUIDE =====================
function Guide() {
  const sections = [
    { t: "How SolGuard Works", c: "SolGuard is a marketplace of 16+ specialized AI security agents. Instead of buying a generic report, you pick the exact analysis you need — contract authority, holder distribution, liquidity verification, AI consultation — and pay only for that single analysis." },
    { t: "How Payments Work", c: "Every analysis costs $0.10 USDC on Solana mainnet. Connect Phantom, confirm the transfer to our verification wallet, and the agent runs automatically once the transaction is confirmed (~3 seconds). Subscription plans (Starter $9/mo, Pro $49/mo) give bulk quota at a discount." },
    { t: "How AI Agents Work", c: "Each agent combines deterministic on-chain analysis (Helius RPC) with GPT-4o-mini synthesis. The on-chain layer gathers raw evidence (mint authorities, holder accounts, slot signatures, pool liquidity). The AI layer produces a trader-ready verdict and recommendation." },
    { t: "How Reports Are Generated", c: "Each agent returns a structured report with: summary (3-sentence verdict), risk score (0–100), risk level (LOW / MEDIUM / HIGH / CRITICAL), evidence (raw JSON from on-chain calls), and recommendations." },
    { t: "Risk Scoring", c: "Each agent has its own weighted formula. Token Audit combines authority status (+50pt for active mint+freeze), holder concentration (+25pt for >50% top 10), bundle clustering (+25pt), and liquidity health. Score ≥76 = CRITICAL, 51–75 HIGH, 26–50 MEDIUM, ≤25 LOW." },
    { t: "Privacy", c: "We store: your wallet address, your scan history, your subscription. We never store: private keys, signed transaction payloads beyond verification, or user PII. Reports are visible only to the wallet that paid for them." },
    { t: "FAQ", c: "Q: Are scans on-chain?\nA: Reads are on-chain via Helius RPC. AI synthesis happens server-side.\n\nQ: Refunds?\nA: All sales final. We refund only on verified agent crashes.\n\nQ: Can I integrate via API?\nA: API keys are issued today; full public API docs are launching soon." },
    { t: "Developer Documentation (Coming Soon)", c: "REST API and SDK launching Q3 2025. Endpoints will mirror /api/agents/:id/run and accept either USDC payment signatures or X-API-Key headers for subscription-backed access. Webhook delivery for async results in roadmap." },
  ];
  return (
    <div className="max-w-4xl mx-auto px-5 py-12">
      <h1 className="text-3xl sm:text-5xl font-bold mb-2">Guide</h1>
      <p className="text-zinc-400 mb-10">Everything you need to know to use SolGuard AI.</p>
      <div className="space-y-4">
        {sections.map((s, i) => (
          <details key={i} className="rounded-2xl bg-zinc-900/40 border border-zinc-800 open:bg-zinc-900/60 transition">
            <summary className="px-5 py-4 cursor-pointer font-bold flex items-center justify-between">
              <span>{s.t}</span>
              <ChevronRight className="w-4 h-4 text-zinc-500 transition group-open:rotate-90" />
            </summary>
            <div className="px-5 pb-5 text-sm text-zinc-400 whitespace-pre-line leading-relaxed">{s.c}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ===================== EXPLOIT WATCH =====================
function ExploitWatch({ setView }) {
  const [data, setData] = useState([]);
  useEffect(() => { api("/api/exploits").then((r) => r.ok && setData(r.data.exploits || [])); }, []);
  const totalLoss = data.reduce((s, e) => s + (e.lossUsd || 0), 0);
  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="rounded-2xl bg-gradient-to-br from-rose-500/10 to-zinc-900/40 border border-rose-500/30 p-6 mb-6">
        <div className="flex items-center gap-3 mb-2"><Flame className="w-6 h-6 text-rose-400" /><h1 className="text-3xl font-bold">Exploit Watch</h1><span className="text-[10px] px-2 py-0.5 rounded bg-rose-500 text-black terminal-text font-bold">LIVE</span></div>
        <p className="text-zinc-400">Real-world Solana & web3 exploits. {data.length} incidents · ${(totalLoss / 1_000_000).toFixed(1)}M lost in the tracked period.</p>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 text-[11px] terminal-text tracking-widest text-zinc-500 border-b border-zinc-800">
          <div className="col-span-3">INCIDENT</div><div className="col-span-2">LOSS</div><div className="col-span-2">VECTOR</div><div className="col-span-4">SUMMARY</div><div className="col-span-1">AGENT</div>
        </div>
        {data.map((e, i) => (
          <div key={e.id} className={`p-4 grid md:grid-cols-12 gap-3 items-center ${i > 0 ? "border-t border-zinc-800" : ""} hover:bg-zinc-900/60 transition`}>
            <div className="md:col-span-3"><div className="font-bold">{e.project}</div><div className="text-xs text-zinc-500">{e.date} · {e.chain}</div></div>
            <div className="md:col-span-2 terminal-text font-bold text-rose-400">${(e.lossUsd / 1_000_000).toFixed(2)}M</div>
            <div className="md:col-span-2 text-xs text-amber-300">{e.vector}</div>
            <div className="md:col-span-4 text-sm text-zinc-400">{e.summary}</div>
            <div className="md:col-span-1"><button onClick={() => setView(`agent:${e.relevantAgent}`)} className="text-xs text-teal-400 hover:text-teal-300 terminal-text">RUN →</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== WATCHLIST =====================
function Watchlist({ setView }) {
  const [items, setItems] = useState([]);
  const [addr, setAddr] = useState(""); const [adding, setAdding] = useState(false); const [error, setError] = useState("");
  async function load() { const r = await api("/api/watchlist"); if (r.ok) setItems(r.data.items || []); }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);
  async function add() {
    if (!isValidSol(addr)) { setError("Invalid address"); return; }
    setError(""); setAdding(true);
    const r = await api("/api/watchlist", { method: "POST", body: JSON.stringify({ tokenAddress: addr.trim() }) });
    setAdding(false); if (!r.ok) setError(r.data?.error || "Failed"); else { setAddr(""); load(); }
  }
  async function remove(a) { await api(`/api/watchlist/${encodeURIComponent(a)}`, { method: "DELETE" }); load(); }
  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex items-center gap-2 mb-2"><Bell className="w-5 h-5 text-teal-400" /><h1 className="text-3xl font-bold">Watchlist</h1></div>
      <p className="text-zinc-400 mb-6">Tokens are re-scanned every 3 minutes. Alerts fire on risk level changes.</p>
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
        <div className="p-10 text-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-zinc-500">No tokens in watchlist. Add a Solana mint above.</div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
          {items.map((it, i) => {
            const lvl = it.state?.riskLevel || "PENDING"; const c = levelColor(lvl);
            return (
              <div key={it.tokenAddress} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-zinc-800" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {it.state?.metadata?.image ? <img src={it.state.metadata.image} className="w-9 h-9 rounded-md border border-zinc-800 object-cover" onError={(e) => e.target.style.display = "none"} /> : <Shield className="w-9 h-9 text-zinc-700 p-1.5 rounded-md border border-zinc-800" />}
                  <div>
                    <div className="font-bold text-sm">{it.state?.metadata?.name || truncate(it.tokenAddress)} <span className="text-zinc-500">{it.state?.metadata?.symbol ? `$${it.state.metadata.symbol}` : ""}</span></div>
                    <div className="text-xs terminal-text text-zinc-600">{truncate(it.tokenAddress, 8)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {it.state?.riskLevel ? <div className={`px-2.5 py-1 rounded bg-zinc-900 border ${c.border} ${c.text} text-xs terminal-text`}>{lvl} · {it.state.riskScore}</div> : <div className="px-2.5 py-1 rounded border border-zinc-800 text-zinc-500 text-xs">SCANNING…</div>}
                  <button onClick={() => setView(`agent:token-audit`)} className="p-2 text-zinc-500 hover:text-teal-400" title="Re-audit"><Search className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(it.tokenAddress)} className="p-2 text-zinc-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===================== DASHBOARD =====================
function Dashboard({ user, setView, overallStats }) {
  const [reports, setReports] = useState([]);
  useEffect(() => { api("/api/reports").then((r) => r.ok && setReports(r.data.reports || [])); }, []);
  const byAgent = useMemo(() => {
    const m = {}; reports.forEach((r) => { m[r.agentId] = (m[r.agentId] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [reports]);
  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
      <p className="text-zinc-400 mb-8 terminal-text text-xs">{user.walletAddress}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Credits" value={user.credits} color="text-teal-400" sub="Free tier (no farming)" />
        <StatCard label="Plan" value={user.plan} color="text-emerald-400" sub={user.subscription ? `${user.subscription.remaining} left` : "—"} />
        <StatCard label="Your Reports" value={reports.length} color="text-amber-400" />
        <StatCard label="Threats Found" value={reports.filter((r) => ["HIGH", "CRITICAL"].includes(r.result?.riskLevel)).length} color="text-rose-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-zinc-900/40 border border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="terminal-text tracking-widest text-sm text-zinc-400">RECENT REPORTS</h3>
            <button onClick={() => setView("explorer")} className="text-xs terminal-text text-teal-400">RUN AGENT →</button>
          </div>
          {reports.length === 0 ? <div className="text-center py-8 text-zinc-500 text-sm">No reports yet. <button onClick={() => setView("explorer")} className="text-teal-400">Browse agents →</button></div> : (
            <div className="space-y-1">
              {reports.slice(0, 10).map((r) => {
                const c = levelColor(r.result?.riskLevel);
                return (
                  <button key={r.id} onClick={() => setView(`report:${r.id}`)} className="w-full text-left p-3 rounded hover:bg-zinc-900 transition flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{r.agentName}</div>
                      <div className="text-xs text-zinc-500 truncate">{Object.values(r.inputs || {}).join(" · ")}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-xs text-zinc-600 hidden sm:block">{new Date(r.createdAt).toLocaleString()}</div>
                      <RiskBadge level={r.result?.riskLevel || "LOW"} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-5">
          <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-4">FAVORITE AGENTS</h3>
          {byAgent.length === 0 ? <div className="text-xs text-zinc-500">Use agents to populate this.</div> : byAgent.map(([id, n]) => (
            <button key={id} onClick={() => setView(`agent:${id}`)} className="w-full text-left p-2 rounded hover:bg-zinc-900 flex items-center justify-between text-sm">
              <span className="capitalize">{id.replace(/-/g, " ")}</span>
              <span className="terminal-text text-teal-400">{n}×</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================== API PAGE =====================
function ApiPage() {
  const [keys, setKeys] = useState([]); const [newKey, setNewKey] = useState(null); const [label, setLabel] = useState(""); const [creating, setCreating] = useState(false);
  async function load() { const r = await api("/api/keys"); if (r.ok) setKeys(r.data.keys || []); }
  useEffect(() => { load(); }, []);
  async function create() { setCreating(true); const r = await api("/api/keys", { method: "POST", body: JSON.stringify({ label: label || "Default" }) }); setCreating(false); if (r.ok) { setNewKey(r.data.key); setLabel(""); load(); } }
  async function revoke(id) { await api(`/api/keys/${id}`, { method: "DELETE" }); load(); }
  return (
    <div className="max-w-4xl mx-auto px-5 py-10">
      <div className="flex items-center gap-2 mb-2"><Code2 className="w-5 h-5 text-teal-400" /><h1 className="text-3xl font-bold">API Access</h1><span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 terminal-text">EARLY ACCESS</span></div>
      <p className="text-zinc-400 mb-6">Generate API keys to call SolGuard agents from your backend. Full public SDK launching soon.</p>

      <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/30 mb-5">
        <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-3">CREATE API KEY</h3>
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Production bot)" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2.5 text-sm outline-none focus:border-teal-500/60" />
          <button onClick={create} disabled={creating} className="px-4 rounded-md bg-teal-500 text-black font-bold hover:bg-teal-400 disabled:opacity-40 terminal-text tracking-wider text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> CREATE</button>
        </div>
        {newKey && (
          <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <div className="text-xs terminal-text text-emerald-300 mb-2">⚠ COPY NOW — WON'T BE SHOWN AGAIN</div>
            <div className="font-mono text-sm bg-zinc-900 p-2 rounded break-all">{newKey}</div>
            <button onClick={() => { navigator.clipboard.writeText(newKey); setNewKey(null); }} className="mt-2 text-xs text-teal-300">COPY & DISMISS</button>
          </div>
        )}
      </div>

      <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/30 mb-5">
        <h3 className="terminal-text tracking-widest text-sm text-zinc-400 mb-3">EXAMPLE REQUEST</h3>
        <pre className="text-xs terminal-text text-zinc-400 overflow-auto p-3 bg-zinc-950 rounded border border-zinc-800">{`POST /api/agents/token-audit/run
Authorization: Bearer $JWT  (or X-API-Key: sg_live_...)
Content-Type: application/json

{
  "inputs": { "tokenAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  "paymentMethod": "subscription"
}`}</pre>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        {keys.length === 0 ? <div className="p-8 text-center text-zinc-500">No keys yet.</div> : keys.map((k, i) => (
          <div key={k.id} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-zinc-800" : ""} ${!k.isActive ? "opacity-50" : ""}`}>
            <div>
              <div className="font-bold">{k.label}</div>
              <div className="text-xs font-mono text-zinc-500 mt-1">{k.key}</div>
              <div className="text-xs text-zinc-600 mt-1">Used {k.usageCount}× · {new Date(k.createdAt).toLocaleDateString()}</div>
            </div>
            {k.isActive ? <button onClick={() => revoke(k.id)} className="text-xs px-3 py-1.5 rounded-md border border-zinc-800 hover:border-rose-500/40 hover:text-rose-400 flex items-center gap-1.5"><Trash2 className="w-3 h-3" /> REVOKE</button> : <span className="text-xs text-zinc-500">REVOKED</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== ROOT APP =====================
export default function App() {
  const [view, setView] = useState("home");
  const [user, setUser] = useState(null);
  const [agents, setAgents] = useState([]);
  const [exploits, setExploits] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [report, setReport] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [toasts, setToasts] = useState([]);
  const sseRef = useRef(null);

  async function refreshAll() {
    const [a, e, s] = await Promise.all([api("/api/agents"), api("/api/exploits"), api("/api/stats/overall")]);
    if (a.ok) setAgents(a.data.agents);
    if (e.ok) setExploits(e.data.exploits);
    if (s.ok) setOverallStats(s.data);
  }
  async function refreshMe() {
    const tok = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
    if (!tok) return;
    const r = await api("/api/me");
    if (r.ok) setUser(r.data); else { localStorage.removeItem("sg_token"); setUser(null); }
  }
  useEffect(() => { refreshAll(); refreshMe(); }, []);

  async function connectWallet() {
    setWalletError(""); setConnecting(true);
    try {
      const provider = window.solana;
      if (!provider?.isPhantom) { setWalletError("Phantom wallet not detected. Install Phantom: phantom.app"); return; }
      const resp = await provider.connect();
      const walletAddress = resp.publicKey.toString();
      const n = await api("/api/auth/nonce", { method: "POST", body: JSON.stringify({ walletAddress }) });
      if (!n.ok) throw new Error(n.data?.error || "Nonce error");
      const { message, nonce } = n.data;
      const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
      const signature = bs58.encode(signed.signature);
      const v = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ walletAddress, signature, nonce }) });
      if (!v.ok) throw new Error(v.data?.error || "Verify failed");
      localStorage.setItem("sg_token", v.data.token);
      await refreshMe();
    } catch (e) { setWalletError(e.message || "Wallet connect failed"); }
    finally { setConnecting(false); }
  }

  // SSE alerts
  useEffect(() => {
    if (!user) return;
    const tok = localStorage.getItem("sg_token"); if (!tok) return;
    const es = new EventSource(`/api/alerts/stream?token=${encodeURIComponent(tok)}`);
    sseRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "alert") {
          setToasts((t) => [...t, msg.alert]);
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== msg.alert.id)), 8000);
        }
      } catch {}
    };
    return () => es.close();
  }, [user]);

  function logout() { localStorage.removeItem("sg_token"); setUser(null); setView("home"); }

  // routing
  const [topView, params] = view.includes(":") ? view.split(":") : [view, null];

  return (
    <div className="min-h-screen">
      <Header view={view} setView={setView} user={user} onConnect={connectWallet} onLogout={logout} connecting={connecting} walletError={walletError} />

      {topView === "home" && <Home agents={agents} setView={setView} overallStats={overallStats} exploits={exploits} />}
      {topView === "explorer" && <Explorer agents={agents} setView={setView} />}
      {topView === "agent" && <AgentPage agentId={params} user={user} ensureWallet={connectWallet} onReport={(rep) => { setReport(rep); setView(`report:${rep.reportId}`); refreshMe(); refreshAll(); }} setView={setView} />}
      {topView === "report" && <ReportView report={report} setView={setView} />}
      {topView === "subscriptions" && <Subscriptions user={user} ensureWallet={connectWallet} onSubscribed={() => { refreshMe(); setView("dashboard"); }} />}
      {topView === "guide" && <Guide />}
      {topView === "watchlist" && user && <Watchlist setView={setView} />}
      {topView === "dashboard" && user && <Dashboard user={user} setView={(v) => { if (v.startsWith("report:")) { (async () => { const r = await api(`/api/reports/${v.split(":")[1]}`); if (r.ok) setReport(r.data); setView(v); })(); } else setView(v); }} overallStats={overallStats} />}
      {topView === "api" && <ApiPage />}
      {topView === "exploits" && <ExploitWatch setView={setView} />}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((a) => {
          const c = levelColor(a.newLevel);
          return (
            <div key={a.id} className={`pointer-events-auto p-4 rounded-xl border ${c.border} bg-zinc-950/95 backdrop-blur shadow-2xl ${c.glow} min-w-[300px]`}>
              <div className="flex items-start gap-3">
                <Bell className={`w-5 h-5 ${c.text} mt-0.5`} />
                <div className="flex-1">
                  <div className="terminal-text text-xs tracking-widest text-zinc-500">RISK LEVEL CHANGED</div>
                  <div className={`font-bold ${c.text} mt-1`}>{a.symbol || truncate(a.tokenAddress)}: {a.previousLevel} → {a.newLevel}</div>
                </div>
                <button onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} className="text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
