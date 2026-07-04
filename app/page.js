"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import BrandLogo from "./components/BrandLogo";
import ServiceCard from "./components/ServiceCard";
import { X402HeroPill, X402InlineTag, X402Chip, X402RoadmapItem } from "./components/X402ComingSoon";
import bs58 from "bs58";
import {
  Shield, ShieldAlert, ShieldCheck, Search, Lock, AlertTriangle, CheckCircle2, XCircle,
  ArrowRight, Sparkles, Copy, ExternalLink, Loader2, Layers, Droplets, Wallet, LogOut, Bell,
  Star, Trash2, Key, Plus, Twitter, Download, Coins, Users, FileText, TrendingUp, Activity,
  Globe, MessageSquare, UserCog, ChevronRight, Filter, Zap, Book, Code2, CreditCard, BarChart3,
  CircleDollarSign, Flame, Clock, X, Send, Bot, Fingerprint, KeyRound,
} from "lucide-react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";

// --- icon map (server returns icon name as string)
const ICONS = { Coins, Lock, Layers, Users, Droplets, FileText, Sparkles, ShieldAlert, TrendingUp, Activity, Globe, Wallet, UserCog, Shield, MessageSquare, Bot, Fingerprint, KeyRound };

const isValidSol = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || "");
const truncate = (a, n = 6) => !a ? "" : (a.length <= n * 2 + 3 ? a : `${a.slice(0, n)}…${a.slice(-n)}`);

/** Map legacy exploit agent IDs to marketplace primary agents */
function resolvePrimaryAgent(agentId) {
  const map = {
    "wallet-audit": "wallet-verification",
    "developer-wallet-analysis": "wallet-verification",
    "bundle-detection": "solana-token-verification",
    "holder-distribution": "solana-token-verification",
    "liquidity-verification": "solana-token-verification",
    "liquidity-lock-analysis": "solana-token-verification",
    "token-audit": "solana-token-verification",
    "volume-authenticity": "solana-token-verification",
  };
  return map[agentId] || agentId;
}

function levelColor(level) {
  switch (level) {
    case "CRITICAL": return { bg: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/40", glow: "shadow-[0_0_30px_rgba(244,63,94,0.4)]", hex: "#f43f5e" };
    case "HIGH": return { bg: "bg-orange-500", text: "text-orange-400", border: "border-orange-500/40", glow: "shadow-[0_0_25px_rgba(249,115,22,0.35)]", hex: "#f97316" };
    case "MEDIUM": return { bg: "bg-amber-400", text: "text-amber-300", border: "border-amber-400/40", glow: "shadow-[0_0_22px_rgba(245,158,11,0.3)]", hex: "#f59e0b" };
    default: return { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/40", glow: "shadow-[0_0_25px_rgba(16,185,129,0.35)]", hex: "#10b981" };
  }
}
function categoryColor(cat) {
  const m = { Token: "blue", Wallet: "violet", Liquidity: "cyan", Market: "amber", Social: "sky", Web: "emerald", AI: "rose", Advisory: "fuchsia" };
  return m[cat] || "blue";
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
        <circle cx="70" cy="70" r={R} stroke="#E2E8F0" strokeWidth="10" fill="none" />
        <circle cx="70" cy="70" r={R} stroke={c.hex} strokeWidth="10" fill="none" strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.2s linear" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`${fs} font-bold ${c.text} terminal-text`}>{display}</div>
        <div className="text-[10px] tracking-widest text-slate-500 uppercase">Risk</div>
      </div>
    </div>
  );
}
function RiskBadge({ level }) {
  const c = levelColor(level);
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 border ${c.border} ${c.text} terminal-text text-xs font-bold tracking-widest`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.bg} pulse-dot`} /> {level}
    </div>
  );
}
function StatCard({ label, value, color = "text-trust-600", sub }) {
  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-trust-sm">
      <div className="text-xs terminal-text tracking-widest text-slate-500">{label.toUpperCase()}</div>
      <div className={`text-3xl font-bold mt-1 terminal-text ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function HeroSparkline({ color, variant = "line" }) {
  const points = variant === "bar"
    ? [28, 42, 35, 55, 48, 62, 45, 58, 52, 68, 55, 72]
    : [40, 55, 45, 62, 50, 70, 58, 48, 65, 52, 68, 60];
  const w = 280;
  const h = 32;
  if (variant === "bar") {
    const barW = w / points.length - 2;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none" aria-hidden>
        {points.map((p, i) => (
          <rect
            key={i}
            x={i * (barW + 2) + 1}
            y={h - (p / 72) * h}
            width={barW}
            height={(p / 72) * h}
            rx={1.5}
            fill={color}
            opacity={0.85}
          />
        ))}
      </svg>
    );
  }
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - (p / 72) * h;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroStatCard({ label, value, subtitle, icon: Icon, accent, chartColor, chartVariant, compact = false }) {
  if (compact) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 shadow-trust-sm p-3 aspect-square flex flex-col min-w-0">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${accent.iconBg}`}>
            <Icon className={`w-3.5 h-3.5 ${accent.iconText}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] terminal-text tracking-widest text-slate-500 leading-tight">{label.toUpperCase()}</div>
            <div className={`text-xl font-bold leading-none mt-0.5 terminal-text ${accent.valueText}`}>{value}</div>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-2 leading-snug line-clamp-2 flex-1">{subtitle}</p>
        <div className="mt-auto pt-2">
          <HeroSparkline color={chartColor} variant={chartVariant} />
          <div className="flex justify-between mt-0.5 text-[7px] terminal-text text-slate-400">
            <span>00:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-trust-sm p-3.5 sm:p-4">
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className={`p-2 rounded-lg shrink-0 ${accent.iconBg}`}>
          <Icon className={`w-4 h-4 ${accent.iconText}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] terminal-text tracking-widest text-slate-500">{label.toUpperCase()}</div>
          <div className={`text-2xl font-bold leading-none mt-0.5 terminal-text ${accent.valueText}`}>{value}</div>
          <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{subtitle}</p>
        </div>
      </div>
      <HeroSparkline color={chartColor} variant={chartVariant} />
      <div className="flex justify-between mt-1 text-[8px] terminal-text text-slate-400">
        <span>00:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

const PIPELINE_STEPS = [
  {
    num: "01",
    label: "CONNECT WALLET",
    title: "Nonce signature auth",
    description: "Server issues a single-use nonce. Phantom signs the message; backend verifies via nacl.sign.detached.verify() and issues a JWT. No password, no email.",
    Icon: Wallet,
  },
  {
    num: "02",
    label: "SELECT AGENT",
    title: "Scoped security modules",
    description: "Pick from five consolidated services — Token Verification, Contract Audit, Wallet Verification, dApp Scan, and AI Consultant — powered by 16+ on-chain analysis engines.",
    Icon: Layers,
  },
  {
    num: "03",
    label: "ON-CHAIN ANALYSIS",
    title: "Helius RPC + heuristics",
    description: "Agents query Solana mainnet via Helius: SPL mint account decode for mint/freeze authority, slot-density clustering for bundle snipes, holder concentration, and DEX liquidity depth.",
    Icon: Activity,
  },
  {
    num: "04",
    label: "RISK REPORT",
    title: "Weighted score + evidence",
    description: "Structured output: 0–100 risk score, severity tier, and a full evidence trail — mint authority state, clustering flags, holder %, pool data — not just a headline number.",
    Icon: BarChart3,
  },
];

const CREDIBILITY_TAGS = [
  "Helius RPC",
  "nacl.sign.detached.verify()",
  "MongoDB Atlas",
  "Solana Mainnet",
  "SPL mint account decode",
  "~2–6s agent execution",
  "USDC pay-per-run",
  "0–100 weighted score",
];

function PipelineFlowDiagram() {
  const nodes = [
    { id: "wallet", label: "WALLET", sub: "sign nonce" },
    { id: "agent", label: "AGENT", sub: "select scope" },
    { id: "rpc", label: "HELIUS RPC", sub: "on-chain read" },
    { id: "score", label: "RISK SCORE", sub: "0–100 + evidence" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
      <div className="text-[10px] terminal-text tracking-widest text-slate-400 mb-4">ARCHITECTURE.SKETCH</div>
      <svg viewBox="0 0 520 88" className="w-full h-auto" aria-hidden="true">
        {nodes.slice(0, -1).map((_, i) => {
          const x1 = 60 + i * 130;
          const x2 = x1 + 70;
          return (
            <g key={i}>
              <line x1={x1 + 36} y1={44} x2={x2 + 24} y2={44} stroke="#BFDBFE" strokeWidth="1.5" strokeDasharray="4 3" />
              <polygon points={`${x2 + 20},44 ${x2 + 14},40 ${x2 + 14},48`} fill="#93C5FD" />
            </g>
          );
        })}
        {nodes.map((n, i) => {
          const x = 24 + i * 130;
          return (
            <g key={n.id}>
              <rect x={x} y={18} width={96} height={52} rx={6} fill="#FFFFFF" stroke="#BFDBFE" strokeWidth="1.5" />
              <text x={x + 48} y={38} textAnchor="middle" className="fill-slate-800" style={{ fontSize: 9, fontFamily: "Orbitron, sans-serif", fontWeight: 700 }}>{n.label}</text>
              <text x={x + 48} y={54} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 7.5, fontFamily: "Orbitron, sans-serif" }}>{n.sub}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HowItWorksSection({ agentCount = 16 }) {
  return (
    <section className="relative max-w-7xl mx-auto px-5 pb-20">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-trust-sm overflow-hidden">
        <div className="p-6 sm:p-8 lg:p-10 border-b border-slate-100">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-trust-200 bg-trust-50 text-trust-700 text-[10px] sm:text-xs terminal-text tracking-widest mb-4">
            <Code2 className="w-3.5 h-3.5" /> // HOW SOLGUARD WORKS
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Is This Token Safe?
          </h2>
          <p className="mt-2 text-sm text-slate-500 max-w-2xl">
            Four-stage scan pipeline — wallet auth, agent dispatch, on-chain heuristics, structured risk output.
          </p>
        </div>

        <div className="p-6 sm:p-8 lg:p-10 space-y-10">
          {/* Horizontal timeline — desktop */}
          <ol className="hidden lg:grid lg:grid-cols-4 lg:gap-6 relative">
            <div className="absolute top-5 left-[12%] right-[12%] h-px bg-trust-200" aria-hidden="true" />
            {PIPELINE_STEPS.map((step, idx) => {
              const StepIcon = step.Icon;
              const desc = idx === 1
                ? step.description.replace("16 specialized agents", `${agentCount} specialized agents`)
                : step.description;
              return (
                <li key={step.num} className="relative flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-trust-50 border border-trust-200 flex items-center justify-center text-trust-700 relative z-10">
                      <StepIcon className="w-[18px] h-[18px]" />
                    </div>
                    <span className="text-[10px] terminal-text text-trust-600 tracking-widest">{step.num}</span>
                  </div>
                  <div className="text-[10px] terminal-text tracking-[0.14em] text-slate-400 mb-1">{step.label}</div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed flex-1">{desc}</p>
                </li>
              );
            })}
          </ol>

          {/* Vertical timeline — mobile / tablet */}
          <ol className="lg:hidden space-y-10">
            {PIPELINE_STEPS.map((step, idx) => {
              const StepIcon = step.Icon;
              const desc = idx === 1
                ? step.description.replace("16 specialized agents", `${agentCount} specialized agents`)
                : step.description;
              return (
                <li key={step.num} className="flex gap-4 sm:gap-6">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-trust-50 border border-trust-200 flex items-center justify-center text-trust-700">
                      <StepIcon className="w-[18px] h-[18px]" />
                    </div>
                    <span className="mt-2 text-[10px] terminal-text text-trust-600 tracking-widest">{step.num}</span>
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <div className="w-px flex-1 min-h-[2rem] bg-trust-200 mt-2" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 pt-0.5 min-w-0 pb-2">
                    <div className="text-[10px] terminal-text tracking-[0.14em] text-slate-400 mb-1">{step.label}</div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">{step.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <PipelineFlowDiagram />

          <div className="pt-2 border-t border-slate-100">
            <div className="text-[10px] terminal-text tracking-widest text-slate-400 mb-3">STACK.VERIFIED</div>
            <div className="flex flex-wrap gap-2">
              {CREDIBILITY_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex px-2.5 py-1 rounded-full border border-trust-200 bg-trust-50 text-[10px] sm:text-[11px] terminal-text text-trust-700 tracking-wide"
                >
                  {tag}
                </span>
              ))}
              <X402Chip />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatsNextSection() {
  return (
    <section className="relative max-w-7xl mx-auto px-5 pb-16">
      <div className="max-w-3xl">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">What&apos;s next</h2>
        <p className="text-sm text-slate-500 mb-5">Upcoming capabilities on the SolGuard roadmap.</p>
        <ul className="space-y-3 list-none m-0 p-0">
          <X402RoadmapItem />
        </ul>
      </div>
    </section>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur p-4" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 neon-glow shadow-trust-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-trust-600 terminal-text tracking-widest mb-1">CONFIRM ANALYSIS</div>
            <h3 className="text-xl font-bold">{agent.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700"><X className="w-5 h-5" /></button>
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
          <div className="text-xs text-slate-500 mb-4 p-3 rounded-md bg-slate-50 border border-slate-200">
            You'll sign a transaction sending {agent.price} USDC to
            <div className="font-mono text-trust-600 break-all mt-1">AnBTwJ…GTiZ3</div>
            Verification happens on-chain before the agent runs.
          </div>
        )}

        {error && <div className="text-sm text-rose-400 mb-3 p-3 rounded-md bg-rose-500/10 border border-rose-500/20">⚠ {error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-3 rounded-md bg-white border border-slate-200 hover:bg-slate-50 transition terminal-text tracking-wider text-sm text-slate-700">CANCEL</button>
          <button onClick={() => onConfirm(choice)} disabled={busy}
            className="flex-[2] px-4 py-3 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 disabled:opacity-50 transition terminal-text tracking-wider text-sm flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {choice === "usdc" ? "WAITING FOR SIGNATURE…" : "RUNNING…"}</> : <>CONFIRM & RUN <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
function PayOption({ icon, active, onClick, title, sub, priceText }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between p-3 rounded-lg border transition ${active ? "border-trust-400 bg-trust-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md ${active ? "bg-trust-100 text-trust-700" : "bg-slate-100 text-slate-600"}`}>{icon}</div>
        <div className="text-left">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-slate-500">{sub}</div>
        </div>
      </div>
      <div className={`terminal-text text-sm font-bold ${active ? "text-trust-700" : "text-slate-600"}`}>{priceText}</div>
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
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/60 backdrop-blur bg-white/90">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
        <button onClick={() => setView("home")} className="flex-shrink-0 py-0.5" aria-label="SolGuard AI home">
          <BrandLogo variant="header" />
        </button>
        <nav className="hidden lg:flex items-center gap-0.5 text-xs terminal-text flex-1 justify-center">
          {nav.filter((n) => !n.auth || user).map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`px-3 py-1.5 rounded-md tracking-widest transition ${view === n.id || view.startsWith(n.id + ":") ? "bg-trust-50 text-trust-700 border border-trust-200" : "text-slate-500 hover:text-slate-700 border border-transparent"}`}>
              {n.label.toUpperCase()}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-trust-50 border border-trust-200 text-xs terminal-text text-slate-700">
                <span className="text-emerald-400">●</span>
                <span className="text-slate-700">{truncate(user.walletAddress)}</span>
                {user.credits > 0 && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="text-trust-600">{user.credits} cr</span>
                  </>
                )}
                {user.subscription && <><span className="text-slate-400">·</span><span className="text-amber-300">{user.subscription.plan}</span></>}
              </div>
              <button onClick={onLogout} className="p-2 rounded-md bg-white border border-slate-200 hover:border-rose-400 hover:text-rose-600 text-slate-600"><LogOut className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <button onClick={onConnect} disabled={connecting}
              className="px-4 py-2 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 disabled:opacity-50 transition text-sm terminal-text tracking-wider flex items-center gap-2">
              <Wallet className="w-4 h-4" /> {connecting ? "CONNECTING…" : "CONNECT"}
            </button>
          )}
        </div>
      </div>
      {walletError && <div className="text-xs text-rose-400 max-w-7xl mx-auto px-5 pb-2">{walletError}</div>}
      <nav className="lg:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 text-[11px] terminal-text border-t border-slate-200">
        {nav.filter((n) => !n.auth || user).map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            className={`px-2.5 py-1 rounded whitespace-nowrap ${view === n.id || view.startsWith(n.id + ":") ? "bg-trust-50 text-trust-700" : "text-slate-500"}`}>
            {n.label.toUpperCase()}
          </button>
        ))}
      </nav>
    </header>
  );
}

// ===================== HOME =====================
function Home({ services, serviceStats, setView, overallStats, exploits }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-trust-100 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -right-40 w-[520px] h-[520px] rounded-full bg-rose-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <section className="relative max-w-7xl mx-auto px-5 pt-12 pb-16 lg:pb-20">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,540px)] gap-8 lg:gap-10 xl:gap-12 items-start lg:max-w-6xl lg:mx-auto">
          {/* Left — copy & CTAs */}
          <div className="flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-trust-200 bg-trust-50 text-trust-700 text-xs terminal-text tracking-widest mb-3">
              <Sparkles className="w-3.5 h-3.5" /> MARKETPLACE OF AI SECURITY AGENTS
            </div>
            <X402HeroPill className="mb-6" />
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold leading-tight tracking-tight text-slate-900">
              Is This <span className="text-trust-600">Token Safe?</span>
            </h1>
            <p className="mt-4 text-xl sm:text-2xl font-bold text-slate-800 max-w-xl leading-snug">
              Ask <span className="text-trust-600">SolGuard.</span> Get a real answer in seconds, not hours.
            </p>
            <p className="mt-5 text-slate-600 max-w-lg text-base sm:text-lg leading-relaxed">
              SolGuard isn&apos;t one scanner. It&apos;s 5 comprehensive security services powered by 16+ analysis engines. Pick the exact verification you need. Pay only $0.10 USDC per run — or subscribe.
            </p>
            <div className="mt-8 w-full sm:max-w-md flex flex-col gap-3">
              <button
                onClick={() => setView("explorer")}
                className="w-full px-7 py-3.5 rounded-lg bg-trust-600 text-white font-bold hover:bg-trust-500 transition terminal-text tracking-wider neon-glow flex items-center justify-center gap-2"
              >
                EXPLORE SECURITY SERVICES <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("subscriptions")}
                className="w-full px-7 py-3.5 rounded-lg border border-trust-300 bg-white text-trust-700 hover:bg-trust-50 transition terminal-text tracking-wider text-sm font-bold"
              >
                VIEW SUBSCRIPTIONS
              </button>
            </div>
            <div className="mt-10 lg:mt-12">
              <BrandLogo variant="header" />
            </div>
          </div>

          {/* Right — live stat cards */}
          {overallStats && (
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-[540px] mx-auto lg:mx-0">
              <HeroStatCard
                compact
                label="Analyses Today"
                value={overallStats.today ?? 0}
                subtitle={(overallStats.today ?? 0) > 0 ? "Analyses performed today." : "No analyses performed today."}
                icon={Activity}
                accent={{ iconBg: "bg-trust-100", iconText: "text-trust-600", valueText: "text-trust-600" }}
                chartColor="#2563EB"
                chartVariant="line"
              />
              <HeroStatCard
                compact
                label="Total Analyses"
                value={overallStats.total ?? 0}
                subtitle="Total token analyses completed."
                icon={FileText}
                accent={{ iconBg: "bg-emerald-100", iconText: "text-emerald-600", valueText: "text-emerald-500" }}
                chartColor="#10b981"
                chartVariant="bar"
              />
              <HeroStatCard
                compact
                label="Threats Detected"
                value={overallStats.threats ?? 0}
                subtitle={(overallStats.threats ?? 0) > 0 ? "High-risk findings flagged." : "No threats detected."}
                icon={ShieldAlert}
                accent={{ iconBg: "bg-rose-100", iconText: "text-rose-500", valueText: "text-rose-500" }}
                chartColor="#f43f5e"
                chartVariant="line"
              />
              <HeroStatCard
                compact
                label="Agents Used (30d)"
                value={`${overallStats.agentsUsedLast30Days ?? 0}/${overallStats.agentsTotal ?? overallStats.agentsActive ?? 16}`}
                subtitle="Distinct agents run in the last 30 days."
                icon={Users}
                accent={{ iconBg: "bg-amber-100", iconText: "text-amber-600", valueText: "text-amber-500" }}
                chartColor="#f59e0b"
                chartVariant="bar"
              />
            </div>
          )}
        </div>
      </section>

      <HowItWorksSection agentCount={services?.length || 5} />

      <WhatsNextSection />

      {/* Security Services preview */}
      <section className="relative max-w-7xl mx-auto px-5 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Security Services</h2>
            <p className="text-slate-500 text-sm mt-1">Five professional verification tiers — token, contract, wallet, web, and advisory.</p>
          </div>
          <button onClick={() => setView("explorer")} className="text-xs terminal-text text-trust-600 hover:text-trust-700 tracking-widest flex items-center gap-1">VIEW ALL → </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(services || []).map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              stats={serviceStats?.[s.id]}
              onOpen={() => { window.location.href = `/services/${s.id}`; }}
            />
          ))}
        </div>
      </section>

      {/* Exploit Watch teaser */}
      {exploits && exploits.length > 0 && (
        <section className="relative max-w-7xl mx-auto px-5 pb-20">
          <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-white border border-rose-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30"><Flame className="w-5 h-5 text-rose-400" /></div>
                <div>
                  <div className="flex items-center gap-2"><h3 className="font-bold text-lg">Exploit Watch</h3><span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500 text-black terminal-text">LIVE</span></div>
                  <div className="text-xs text-slate-500">Real-world Solana exploits — real losses.</div>
                </div>
              </div>
              <button onClick={() => setView("exploits")} className="text-xs terminal-text text-rose-400 hover:text-rose-300">VIEW FEED →</button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {exploits.slice(0, 3).map((e) => (
                <div key={e.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm">{e.project}</div>
                    <div className="text-rose-400 terminal-text text-sm font-bold">${(e.lossUsd / 1_000_000).toFixed(1)}M</div>
                  </div>
                  <div className="text-xs text-slate-500 mb-1">{e.vector} · {e.chain}</div>
                  <div className="text-xs text-slate-600 line-clamp-2">{e.summary}</div>
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
    <button onClick={onOpen} className="group text-left p-5 rounded-2xl bg-white border border-slate-200 shadow-trust-sm hover:border-trust-400 hover:bg-slate-50 transition-all flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-lg bg-trust-50 border border-trust-200 text-trust-600"><Icon className="w-5 h-5" /></div>
        <div className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600 terminal-text tracking-widest">{agent.category.toUpperCase()}</div>
      </div>
      <h3 className="font-bold mb-2 text-lg">{agent.name}</h3>
      <p className="text-sm text-slate-600 line-clamp-3 mb-4 flex-1">{agent.description}</p>
      <div className="flex items-center justify-between pt-3 border-t border-slate-200">
        <div>
          <div className="text-xl font-bold terminal-text">${agent.price.toFixed(2)} <span className="text-xs text-slate-500 font-normal">USDC</span></div>
          <div className="mt-1.5"><X402InlineTag /></div>
          <div className="text-[10px] text-slate-500 terminal-text tracking-wider mt-1.5">{agent.estimatedTime} · {agent.supportedChains.join(", ")}</div>
        </div>
        <div className="text-trust-600 group-hover:translate-x-1 transition-transform"><ChevronRight className="w-5 h-5" /></div>
      </div>
    </button>
  );
}

// ===================== EXPLORER =====================
function Explorer({ services, serviceStats, setView }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const cats = ["ALL", ...Array.from(new Set((services || []).map((s) => s.category)))];
  const filtered = (services || []).filter(
    (s) => (cat === "ALL" || s.category === cat) && (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Security Services</h1>
        <p className="text-slate-500 mt-2">Five consolidated verification services for Solana asset protection — token, contract, wallet, web, and advisory.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…"
            className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-4 py-3 text-sm outline-none focus:border-trust-500" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-2 rounded-md text-xs terminal-text tracking-wider whitespace-nowrap border ${cat === c ? "bg-trust-50 border-trust-300 text-trust-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((s) => (
          <ServiceCard
            key={s.id}
            service={s}
            stats={serviceStats?.[s.id]}
            onOpen={() => { window.location.href = `/services/${s.id}`; }}
          />
        ))}
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-slate-500">No services match.</div>}
    </div>
  );
}

// ===================== AGENT DETAIL & RUNNER =====================
function AgentPage({ agentId, user, ensureWallet, onReport, setView, testingModeFreeRuns = false }) {
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

  if (!agent) return <div className="max-w-5xl mx-auto px-5 py-20 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  const Icon = ICONS[agent.icon] || Shield;
  const allFilled = agent.inputs.every((i) => inputs[i.key] && inputs[i.key].trim().length > 0);

  async function executeRun(paymentMethod, paymentSignature = null) {
    setBusy(true); setError("");
    try {
      const r = await api(`/api/agents/${agent.id}/run`, {
        method: "POST",
        body: JSON.stringify({ inputs, paymentMethod, paymentSignature }),
      });
      if (!r.ok) throw new Error(r.data?.error || "Run failed");
      setPayOpen(false);
      onReport(r.data);
    } catch (e) {
      setError(e.message || "Run failed");
    } finally {
      setBusy(false);
    }
  }

  function start() {
    setError("");
    if (!user) { ensureWallet(); return; }
    if (testingModeFreeRuns) executeRun("testing");
    else setPayOpen(true);
  }

  async function confirmPayment(choice) {
    try {
      let paymentSignature = null;
      if (choice === "usdc") {
        const provider = typeof window !== "undefined" ? window.solana : null;
        if (!provider?.isPhantom) throw new Error("Phantom wallet not detected");
        if (!provider.isConnected) await provider.connect();
        paymentSignature = await sendUsdcPayment({ amountUsdc: agent.price, walletProvider: provider });
      }
      await executeRun(choice, paymentSignature);
    } catch (e) {
      setError(e.message || "Payment failed");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <button onClick={() => setView("explorer")} className="text-xs terminal-text text-slate-500 hover:text-trust-600 mb-6">← BACK TO MARKETPLACE</button>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* header */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-xl bg-trust-50 border border-trust-200 text-trust-600"><Icon className="w-7 h-7" /></div>
              <div className="flex-1">
                <div className="text-xs text-slate-500 terminal-text tracking-widest mb-1">{agent.category.toUpperCase()} AGENT</div>
                <h1 className="text-3xl font-bold mb-1 text-slate-900">{agent.name}</h1>
                <p className="text-slate-600">{agent.description}</p>
              </div>
            </div>
            {agent.longDescription && <p className="text-sm text-slate-600 leading-relaxed border-t border-slate-200 pt-4">{agent.longDescription}</p>}
            {agent.id === "solana-token-verification" && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                {["Bundle Detection", "Holder Distribution", "Liquidity Depth", "Mint Authority", "AI Summary"].map((m) => (
                  <span key={m} className="text-[10px] px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-600">{m}</span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {agent.supportedChains.map((c) => (
                <span key={c} className="text-xs terminal-text px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {c}
                </span>
              ))}
            </div>
          </div>

          {/* features */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6">
            <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-3">CAPABILITIES</h3>
            <ul className="grid sm:grid-cols-2 gap-2">
              {agent.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-trust-600 flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* inputs */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6">
            <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-4">INPUTS</h3>
            {agent.inputs.map((i) => (
              <div key={i.key} className="mb-4">
                <label className="text-xs terminal-text text-slate-500 mb-1.5 block">{i.label}</label>
                {i.multiline ? (
                  <textarea value={inputs[i.key] || ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })}
                    placeholder={i.placeholder} rows={4}
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm terminal-text outline-none focus:border-trust-500" />
                ) : (
                  <input value={inputs[i.key] || ""} onChange={(e) => setInputs({ ...inputs, [i.key]: e.target.value })}
                    placeholder={i.placeholder}
                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm terminal-text outline-none focus:border-trust-500" />
                )}
                {i.example && <button onClick={() => setInputs({ ...inputs, [i.key]: i.example })} className="text-[11px] text-trust-600 hover:text-trust-700 mt-1">Use example →</button>}
              </div>
            ))}
            {error && <div className="text-sm text-rose-400 mb-3">⚠ {error}</div>}
            <button onClick={start} disabled={!allFilled || busy}
              className="w-full px-6 py-3 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 disabled:opacity-40 transition terminal-text tracking-wider flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} {user ? (testingModeFreeRuns ? "RUN ANALYSIS (FREE)" : "START ANALYSIS") : "CONNECT WALLET TO RUN"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-5">
            <div className="text-xs terminal-text tracking-widest text-slate-500 mb-2">PRICE</div>
            {testingModeFreeRuns ? (
              <>
                <div className="text-2xl font-bold terminal-text text-emerald-600">FREE</div>
                <div className="text-xs text-slate-500 mt-1">testing mode — no payment required</div>
              </>
            ) : (
              <>
                <div className="text-4xl font-bold terminal-text">${agent.price.toFixed(2)}</div>
                <div className="text-xs text-slate-500 mt-1">per analysis · USDC on Solana</div>
              </>
            )}
            <div className="mt-2"><X402InlineTag /></div>
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-500">Est. time</span><span className="terminal-text">{agent.estimatedTime}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Free credit</span><span className="terminal-text text-emerald-400">{user?.credits || 0} left</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Subscription</span><span className="terminal-text">{user?.subscription ? user.subscription.plan : "none"}</span></div>
            </div>
          </div>

          {recent.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-5">
              <div className="text-xs terminal-text tracking-widest text-slate-500 mb-3">YOUR RECENT REPORTS</div>
              <div className="space-y-1">
                {recent.map((r) => (
                  <button key={r.id} onClick={() => setView(`report:${r.id}`)} className="w-full text-left p-2 rounded hover:bg-slate-100 transition flex items-center justify-between text-xs">
                    <div className="text-slate-600 truncate">{Object.values(r.inputs).join(" · ").slice(0, 30)}</div>
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
function AiSummaryNotice({ available, reason }) {
  if (available !== false) return null;
  return (
    <div className="mb-4 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900 leading-relaxed">
      AI summary unavailable — showing on-chain data only.
      {reason ? <span className="text-amber-700/80"> ({reason})</span> : null}
    </div>
  );
}

function ImpactBadge({ impact }) {
  const t = (impact || "neutral").toLowerCase();
  const cls = t === "unknown"
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : t.includes("+") || (t.includes("risk") && !t.includes("-"))
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : t.includes("-")
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-600 border-slate-200";
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{impact || "neutral"}</span>;
}

function ReportMetadata({ r }) {
  const scanned = r.scannedAt ? new Date(r.scannedAt).toLocaleString() : null;
  const sources = (r.dataSource || []).join(" · ");
  if (!scanned && !r.confidence && !sources) return null;
  return (
    <div className="text-xs text-slate-500 mb-5 flex flex-wrap gap-x-4 gap-y-1">
      {scanned && <span>Scanned: <span className="text-slate-600">{scanned}</span></span>}
      {sources && <span>Sources: <span className="text-slate-600">{sources}</span></span>}
      {r.confidence && <span>Confidence: <span className="text-slate-600">{r.confidence}</span></span>}
    </div>
  );
}

function KeyFindingsTable({ findings }) {
  if (!findings?.length) return null;
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6 mb-5 overflow-x-auto">
      <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-4">KEY FINDINGS</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs terminal-text text-slate-500 border-b border-slate-200">
            <th className="pb-2 pr-4 font-normal">CHECK</th>
            <th className="pb-2 pr-4 font-normal">VALUE</th>
            <th className="pb-2 pr-4 font-normal">IMPACT</th>
            <th className="pb-2 font-normal">WHAT IT MEANS</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 align-top">
              <td className="py-3 pr-4 font-medium text-slate-800 whitespace-nowrap">{f.label}</td>
              <td className="py-3 pr-4 terminal-text text-slate-700 whitespace-nowrap">{f.value}</td>
              <td className="py-3 pr-4"><ImpactBadge impact={f.impact} /></td>
              <td className="py-3 text-slate-600 leading-relaxed">{f.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ report, setView }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("overview");
  const [rawOpen, setRawOpen] = useState(false);
  if (!report) return <div className="text-center py-20 text-slate-500">No report.</div>;
  const r = report.result || report;
  const verdict = r.verdict || r.summary || "";
  const c = levelColor(r.riskLevel);
  const isComposite = report.agentId === "solana-token-verification";
  const sub = r.rawEvidence?.subModules || r.evidence?.subModules;
  const aiAvailable = r.ai_summary_available ?? r.rawEvidence?.ai_summary_available ?? r.evidence?.ai_summary_available;
  const aiReason = r.ai_summary_reason ?? r.rawEvidence?.ai_summary_reason ?? r.evidence?.ai_summary_reason;
  const rawData = r.rawEvidence ?? r.evidence ?? {};

  function copy() {
    const txt = `🔍 SolGuard AI · ${report.agentName || report.agentId}\nRisk: ${r.riskLevel} (${r.riskScore}/100)\n\n${verdict}\n\nsolguard.ai`;
    navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800);
  }
  function dl() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `solguard-${report.reportId || report.id}.json`; a.click(); URL.revokeObjectURL(url);
  }

  function SubModulePanel({ title, children }) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6 mb-5">
        <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-4">{title}</h3>
        {children}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <button onClick={() => setView("explorer")} className="text-xs terminal-text text-slate-500 hover:text-trust-600 mb-6">← BACK TO EXPLORER</button>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6 mb-5">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
          <div className="flex-1">
            <div className="text-xs text-trust-600 terminal-text tracking-widest mb-2">AGENT REPORT</div>
            <h1 className="text-3xl font-bold mb-2 text-slate-900">{report.agentName || report.agentId}</h1>
            <div className="text-sm text-slate-600 mb-3">Input: <span className="terminal-text text-slate-700">{r.input || Object.values(report.inputs || {}).join(", ")}</span></div>
            <div className="flex gap-2">
              <button onClick={copy} className="text-xs terminal-text px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:border-trust-300 transition flex items-center gap-1.5 text-slate-700"><Copy className="w-3 h-3" /> {copied ? "COPIED" : "COPY"}</button>
              <button onClick={dl} className="text-xs terminal-text px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:border-trust-300 transition flex items-center gap-1.5 text-slate-700"><Download className="w-3 h-3" /> JSON</button>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ScoreGauge score={r.riskScore || 0} level={r.riskLevel || "LOW"} />
            <div className="mt-3"><RiskBadge level={r.riskLevel || "LOW"} /></div>
          </div>
        </div>
      </div>

      <ReportMetadata r={r} />

      {isComposite && sub && (
        <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto">
          {[["overview", "Overview"], ["bundle", "Bundle"], ["holders", "Holders"], ["liquidity", "Liquidity"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs terminal-text tracking-widest whitespace-nowrap border-b-2 transition ${tab === k ? "border-trust-500 text-trust-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{l.toUpperCase()}</button>
          ))}
        </div>
      )}

      {(tab === "overview" || !isComposite) && (
        <>
          <div className="rounded-2xl bg-gradient-to-br from-trust-50 to-white border border-trust-200 p-6 mb-5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-trust-500" />
            <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-trust-600" /><h3 className="terminal-text text-sm tracking-widest text-trust-700">VERDICT</h3></div>
            <AiSummaryNotice available={aiAvailable} reason={aiReason} />
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{verdict}</p>
          </div>

          <KeyFindingsTable findings={r.keyFindings} />

          {r.recommendations?.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6 mb-5">
              <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-4">RECOMMENDATIONS</h3>
              <ul className="space-y-2">{r.recommendations.map((x, i) => (
                <li key={i} className="flex gap-3 p-3 rounded bg-slate-50 border border-slate-200 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-trust-600 flex-shrink-0 mt-0.5" />
                  <span>{x}</span>
                </li>
              ))}</ul>
            </div>
          )}

          {r.rawEvidence?.fullResponse && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6 mb-5">
              <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-4">FULL RESPONSE</h3>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">{r.rawEvidence.fullResponse}</p>
            </div>
          )}
        </>
      )}

      {isComposite && tab === "bundle" && sub?.bundle && (
        <SubModulePanel title="BUNDLE DETECTION">
          <p className="text-sm text-slate-700 mb-4">{sub.bundle.detected ? `Coordinated activity: ${sub.bundle.walletCount} wallets clustered.` : "No bundle clustering detected."}</p>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>Top 10 hold: {sub.bundle.top10Percent?.toFixed?.(1) ?? sub.bundle.top10Percent}%</li>
            <li>Early slot clustering: {sub.bundle.earlySlotClustering ? "Yes" : "No"}</li>
          </ul>
        </SubModulePanel>
      )}

      {isComposite && tab === "holders" && sub?.holders && (
        <SubModulePanel title="HOLDER DISTRIBUTION">
          <ul className="text-sm text-slate-700 space-y-2">
            <li>Top holder: {sub.holders.topHolderPercent?.toFixed?.(1) ?? sub.holders.topHolderPercent}% of supply</li>
            <li>Top 10 wallets: {sub.holders.top10Percent?.toFixed?.(1) ?? sub.holders.top10Percent}% of supply</li>
          </ul>
        </SubModulePanel>
      )}

      {isComposite && tab === "liquidity" && sub?.liquidity && (
        <SubModulePanel title="LIQUIDITY DEPTH">
          <p className="text-sm text-slate-700 mb-2">{sub.liquidity.poolFound ? `Pool found — $${Math.round(sub.liquidity.liquidityUsd || 0).toLocaleString()} liquidity.` : "No active DEX pool detected."}</p>
        </SubModulePanel>
      )}

      {(!isComposite || tab === "overview") && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6">
          <button
            type="button"
            onClick={() => setRawOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left"
          >
            <h3 className="terminal-text tracking-widest text-sm text-slate-600">ADVANCED / RAW DATA</h3>
            <span className="text-xs text-slate-500">{rawOpen ? "Hide" : "Show"}</span>
          </button>
          {rawOpen && (
            <pre className="mt-4 text-xs terminal-text text-slate-200 overflow-auto max-h-96 p-3 bg-slate-900 rounded border border-slate-800">
              {JSON.stringify(isComposite && rawData.subModules ? { ...rawData, subModules: undefined } : rawData, null, 2)}
            </pre>
          )}
        </div>
      )}
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
        <h1 className="text-3xl sm:text-5xl font-bold text-slate-900">Subscriptions</h1>
        <p className="text-slate-600 mt-3 max-w-2xl mx-auto">Prefer not to pay per call? Subscribe once and access every AI agent at a flat rate. Pay in USDC on Solana.</p>
      </div>

      {error && <div className="text-rose-400 text-sm text-center mb-4">⚠ {error}</div>}

      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const popular = p.popular;
          return (
            <div key={p.id} className={`relative rounded-2xl p-6 ${popular ? "bg-gradient-to-br from-trust-50 to-white border-2 border-trust-400 neon-glow" : "bg-white border border-slate-200"}`}>
              {popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-trust-600 text-white text-xs terminal-text font-bold tracking-widest">POPULAR</div>}
              <div className="text-center mb-6">
                <div className="text-slate-600 terminal-text tracking-widest text-sm mb-2">{p.name.toUpperCase()}</div>
                <div className="text-5xl font-bold">{p.custom ? "Custom" : `$${p.priceUsdc}`}<span className="text-base text-slate-500">/mo</span></div>
                <div className="text-slate-600 mt-2">{p.quota === -1 ? "Unlimited analyses" : `${p.quota.toLocaleString()} analyses / 30 days`}</div>
                {p.quota > 0 && <div className="text-xs text-slate-500 mt-1">≈ ${(p.priceUsdc / p.quota).toFixed(3)} per analysis</div>}
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-trust-600" /> Access to all security services</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-trust-600" /> Real-time watchlist alerts</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-trust-600" /> Report history & exports</li>
                {p.id !== "starter" && <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-trust-600" /> Priority RPC routing</li>}
                {p.id === "business" && <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-trust-600" /> Dedicated SLA</li>}
              </ul>
              <button onClick={() => subscribe(p)} disabled={busy === p.id}
                className={`w-full px-4 py-3 rounded-md font-bold terminal-text tracking-wider transition ${popular ? "bg-trust-600 text-white hover:bg-trust-500" : "bg-white border border-slate-200 text-trust-700 hover:bg-trust-50 hover:border-trust-300"} disabled:opacity-50 flex items-center justify-center gap-2`}>
                {busy === p.id ? <><Loader2 className="w-4 h-4 animate-spin" /> PROCESSING…</> : p.custom ? "CONTACT SALES" : "SUBSCRIBE"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 max-w-3xl mx-auto p-6 rounded-2xl bg-white border border-slate-200 shadow-trust-sm">
        <h3 className="font-bold mb-3">How a subscription works</h3>
        <ol className="space-y-2 text-sm text-slate-600 list-decimal pl-5">
          <li>Pay once in USDC on Solana — verified on-chain.</li>
          <li>Quota credited to your connected wallet for 30 days.</li>
          <li>Run any security service — quota decreases by 1 per analysis.</li>
          <li>Subscription does not auto-renew. Top up anytime.</li>
        </ol>
      </div>
    </div>
  );
}

// ===================== GUIDE =====================
function GuideCodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="relative rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={copy}
        className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 bg-white text-[11px] terminal-text text-slate-600 hover:border-trust-300 hover:text-trust-700 transition"
      >
        <Copy className="w-3 h-3" /> {copied ? "COPIED" : "COPY"}
      </button>
      <pre className="p-4 pr-24 text-xs sm:text-sm terminal-text text-slate-800 overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

function GuideStep({ n, title, children }) {
  return (
    <li className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-trust-700 text-white flex items-center justify-center text-sm font-bold font-brand">
        {n}
      </div>
      <div className="flex-1 pt-0.5 pb-8">
        <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
        <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function GuideFieldRow({ name, desc }) {
  return (
    <div className="px-4 py-3 rounded-lg border border-slate-200 bg-white text-sm">
      <span className="terminal-text font-medium text-slate-900">{name}</span>
      <span className="text-slate-500"> — {desc}</span>
    </div>
  );
}

function Guide({ setView }) {
  const curlExample = `curl -i -X POST "https://solguard.ai/api/agents/solana-token-verification/run" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <JWT>" \\
  -d '{"inputs":{"tokenAddress":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"},"paymentMethod":"usdc","paymentSignature":"<tx_signature>"}'`;

  const whatsHere = [
    {
      path: "/",
      desc: "The explorer: browse five consolidated security services with pricing, categories, and live 30-day usage stats.",
    },
    {
      path: "/api/services",
      desc: "Marketplace service catalog (JSON) — five professional verification tiers with primary agent routing.",
    },
    {
      path: "/api/agents",
      desc: "Full agent catalog (JSON) — all analysis engines for SDK and programmatic access.",
    },
    {
      path: "/api/agents/[id]/run",
      desc: "One endpoint per agent — POST JSON with inputs and paymentMethod. Returns the structured risk report on success.",
    },
    {
      path: "/api/payment/config",
      desc: "Returns the USDC mint and destination wallet for browser-side SPL transfers before an agent run.",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-5 py-12 sm:py-16">
      <header className="mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-3">How it works</h1>
        <p className="text-sm terminal-text text-slate-500 tracking-wide">
          Pay-per-use security scans over USDC · Solana mainnet
        </p>
        <p className="mt-6 text-slate-600 leading-relaxed">
          Each SolGuard service is a fixed-price analysis tier — $0.10 USDC per scan ($0.06 with Pro, coming soon).
          Instead of passwords or email accounts, you authenticate with your wallet: sign a server nonce via{" "}
          <span className="terminal-text text-slate-800">nacl.sign.detached.verify()</span>, receive a JWT, and pay
          per run with an on-chain USDC transfer. Agents query Helius RPC for mint authority, slot clustering, holder
          concentration, and liquidity — then return a weighted risk report with evidence.
        </p>
      </header>

      <section className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 mb-5">What&apos;s here</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {whatsHere.map(({ path, desc }) => (
            <div key={path} className="p-4 rounded-lg border border-slate-200 bg-white">
              <div className="terminal-text text-sm font-medium text-slate-900 mb-2">{path}</div>
              <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 mb-6">The analysis flow</h2>
        <ol className="list-none m-0 p-0">
          <GuideStep n={1} title="Pick an agent & submit inputs">
            On the explorer, open an agent, fill its inputs (e.g.{" "}
            <span className="terminal-text text-slate-800">tokenAddress</span>), and hit Start Analysis. Your wallet
            must be connected — unauthenticated requests return{" "}
            <span className="terminal-text text-slate-800">401</span>.
          </GuideStep>
          <GuideStep n={2} title="Client sends USDC on-chain">
            Phantom builds an SPL <span className="terminal-text text-slate-800">transferChecked</span> to the
            destination ATA (~$0.10 USDC). Alternatively use a free credit or subscription quota via{" "}
            <span className="terminal-text text-slate-800">paymentMethod: &quot;credit&quot;</span> or{" "}
            <span className="terminal-text text-slate-800">&quot;subscription&quot;</span>.
          </GuideStep>
          <GuideStep n={3} title="Server verifies payment">
            The backend polls Helius RPC with{" "}
            <span className="terminal-text text-slate-800">getParsedTransaction</span>, validates USDC credited to
            the destination ATA, and dedupes the signature in MongoDB. Failed or missing payment returns{" "}
            <span className="terminal-text text-slate-800">402</span>.
          </GuideStep>
          <GuideStep n={4} title="Agent executes on-chain heuristics">
            <span className="terminal-text text-slate-800">scanEngine</span> decodes the SPL mint account (mint/freeze
            authority), groups launch signatures by slot for bundle detection, reads holder concentration and DEX pool
            liquidity. Each agent applies its own weighted scoring formula.
          </GuideStep>
          <GuideStep n={5} title="Report is returned">
            On success the server returns{" "}
            <span className="terminal-text text-slate-800">200</span> JSON:{" "}
            <span className="terminal-text text-slate-800">riskScore</span> (0–100),{" "}
            <span className="terminal-text text-slate-800">riskLevel</span>, summary, evidence trail, and
            recommendations. The report is persisted to your account at{" "}
            <span className="terminal-text text-slate-800">/api/reports</span>.
          </GuideStep>
        </ol>
      </section>

      <section className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 mb-5">Try it yourself</h2>
        <ol className="space-y-2 text-sm text-slate-600 list-decimal pl-5 mb-6 leading-relaxed">
          <li>Get USDC in Phantom on Solana mainnet.</li>
          <li>Connect your wallet (nonce sign → JWT via <span className="terminal-text text-slate-800">/api/auth/verify</span>).</li>
          <li>Open the explorer, pick Token Audit, fill a mint address, and pay USDC.</li>
          <li>
            Or call an endpoint directly — without auth you get a{" "}
            <span className="terminal-text text-slate-800">401</span>:
          </li>
        </ol>
        <GuideCodeBlock code={curlExample} />
        <p className="mt-3 text-xs text-slate-500">
          POST JSON is the canonical call method. Include a valid{" "}
          <span className="terminal-text">paymentSignature</span> from your USDC transfer when using{" "}
          <span className="terminal-text">paymentMethod: &quot;usdc&quot;</span>.
        </p>
      </section>

      <section className="mb-14">
        <h2 className="text-xl font-bold text-slate-900 mb-5">Fields in play</h2>
        <div className="space-y-2">
          <GuideFieldRow name="Authorization" desc="client → server: JWT from wallet nonce signature auth" />
          <GuideFieldRow name="paymentMethod" desc='run body: "usdc" | "credit" | "subscription"' />
          <GuideFieldRow name="paymentSignature" desc="run body: Solana tx signature for the USDC SPL transfer" />
          <GuideFieldRow name="inputs" desc="run body: agent-specific fields (tokenAddress, walletAddress, url, query)" />
        </div>
      </section>

      <section className="mb-14">
        <div className="text-[10px] terminal-text tracking-widest text-slate-400 mb-3">STACK.VERIFIED</div>
        <div className="flex flex-wrap gap-2">
          {["Helius RPC", "MongoDB Atlas", "Solana Mainnet", "USDC pay-per-run"].map((tag) => (
            <span
              key={tag}
              className="inline-flex px-2.5 py-1 rounded-full border border-trust-200 bg-trust-50 text-[10px] sm:text-[11px] terminal-text text-trust-700 tracking-wide"
            >
              {tag}
            </span>
          ))}
          <X402Chip />
        </div>
      </section>

      <nav className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-8 border-t border-slate-200 text-sm">
        <button
          type="button"
          onClick={() => setView("explorer")}
          className="text-trust-700 hover:text-trust-800 font-medium transition"
        >
          ← Explorer
        </button>
        <button
          type="button"
          onClick={() => setView("subscriptions")}
          className="text-trust-700 hover:text-trust-800 font-medium transition sm:text-right"
        >
          Subscriptions →
        </button>
      </nav>
      <p className="mt-6 text-xs terminal-text text-slate-400 tracking-wide text-center sm:text-left">
        Pay-per-use verification over x402 (coming soon) · USDC · Solana mainnet
      </p>
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
      <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-white border border-rose-500/30 p-6 mb-6">
        <div className="flex items-center gap-3 mb-2"><Flame className="w-6 h-6 text-rose-500" /><h1 className="text-3xl font-bold text-slate-900">Exploit Watch</h1><span className="text-[10px] px-2 py-0.5 rounded bg-rose-500 text-black terminal-text font-bold">LIVE</span></div>
        <p className="text-slate-600">Real-world Solana & web3 exploits. {data.length} incidents · ${(totalLoss / 1_000_000).toFixed(1)}M lost in the tracked period.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 text-[11px] terminal-text tracking-widest text-slate-500 border-b border-slate-200">
          <div className="col-span-3">INCIDENT</div><div className="col-span-2">LOSS</div><div className="col-span-2">VECTOR</div><div className="col-span-4">SUMMARY</div><div className="col-span-1">AGENT</div>
        </div>
        {data.map((e, i) => (
          <div key={e.id} className={`p-4 grid md:grid-cols-12 gap-3 items-center ${i > 0 ? "border-t border-slate-200" : ""} hover:bg-slate-50 transition`}>
            <div className="md:col-span-3"><div className="font-bold">{e.project}</div><div className="text-xs text-slate-500">{e.date} · {e.chain}</div></div>
            <div className="md:col-span-2 terminal-text font-bold text-rose-400">${(e.lossUsd / 1_000_000).toFixed(2)}M</div>
            <div className="md:col-span-2 text-xs text-amber-300">{e.vector}</div>
            <div className="md:col-span-4 text-sm text-slate-600">{e.summary}</div>
            <div className="md:col-span-1"><button onClick={() => setView(`agent:${resolvePrimaryAgent(e.relevantAgent)}`)} className="text-xs text-trust-600 hover:text-trust-700 terminal-text">RUN →</button></div>
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
      <div className="flex items-center gap-2 mb-2"><Bell className="w-5 h-5 text-trust-600" /><h1 className="text-3xl font-bold text-slate-900">Watchlist</h1></div>
      <p className="text-slate-600 mb-6">Tokens are re-scanned every 3 minutes. Alerts fire on risk level changes.</p>
      <div className="flex gap-2 mb-6">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Token mint address"
          className="flex-1 bg-white border border-slate-200 rounded-md px-4 py-3 terminal-text text-sm outline-none focus:border-trust-500" />
        <button onClick={add} disabled={adding || !isValidSol(addr)}
          className="px-5 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 disabled:opacity-40 terminal-text tracking-wider text-sm flex items-center gap-2">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} ADD
        </button>
      </div>
      {error && <div className="text-rose-400 text-sm mb-4">⚠ {error}</div>}
      {items.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-slate-200 bg-white text-slate-500">No tokens in watchlist. Add a Solana mint above.</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {items.map((it, i) => {
            const lvl = it.state?.riskLevel || "PENDING"; const c = levelColor(lvl);
            return (
              <div key={it.tokenAddress} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-slate-200" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {it.state?.metadata?.image ? <img src={it.state.metadata.image} className="w-9 h-9 rounded-md border border-slate-200 object-cover" onError={(e) => e.target.style.display = "none"} /> : <Shield className="w-9 h-9 text-slate-400 p-1.5 rounded-md border border-slate-200" />}
                  <div>
                    <div className="font-bold text-sm">{it.state?.metadata?.name || truncate(it.tokenAddress)} <span className="text-slate-500">{it.state?.metadata?.symbol ? `$${it.state.metadata.symbol}` : ""}</span></div>
                    <div className="text-xs terminal-text text-slate-500">{truncate(it.tokenAddress, 8)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {it.state?.riskLevel ? <div className={`px-2.5 py-1 rounded bg-slate-900 border ${c.border} ${c.text} text-xs terminal-text`}>{lvl} · {it.state.riskScore}</div> : <div className="px-2.5 py-1 rounded border border-slate-200 text-slate-500 text-xs">SCANNING…</div>}
                  <button onClick={() => setView(`agent:solana-token-verification`)} className="p-2 text-slate-500 hover:text-trust-600" title="Re-audit"><Search className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(it.tokenAddress)} className="p-2 text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
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
      <h1 className="text-3xl font-bold mb-1 text-slate-900">Dashboard</h1>
      <p className="text-slate-600 mb-8 terminal-text text-xs">{user.walletAddress}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Credits" value={user.credits} color="text-trust-600" sub="Free tier (no farming)" />
        <StatCard label="Plan" value={user.plan} color="text-emerald-400" sub={user.subscription ? `${user.subscription.remaining} left` : "—"} />
        <StatCard label="Your Reports" value={reports.length} color="text-amber-400" />
        <StatCard label="Threats Found" value={reports.filter((r) => ["HIGH", "CRITICAL"].includes(r.result?.riskLevel)).length} color="text-rose-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="terminal-text tracking-widest text-sm text-slate-600">RECENT REPORTS</h3>
            <button onClick={() => setView("explorer")} className="text-xs terminal-text text-trust-600">RUN AGENT →</button>
          </div>
          {reports.length === 0 ? <div className="text-center py-8 text-slate-500 text-sm">No reports yet. <button onClick={() => setView("explorer")} className="text-trust-600">Browse agents →</button></div> : (
            <div className="space-y-1">
              {reports.slice(0, 10).map((r) => {
                const c = levelColor(r.result?.riskLevel);
                return (
                  <button key={r.id} onClick={() => setView(`report:${r.id}`)} className="w-full text-left p-3 rounded hover:bg-slate-100 transition flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{r.agentName}</div>
                      <div className="text-xs text-slate-500 truncate">{Object.values(r.inputs || {}).join(" · ")}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-xs text-slate-500 hidden sm:block">{new Date(r.createdAt).toLocaleString()}</div>
                      <RiskBadge level={r.result?.riskLevel || "LOW"} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-5">
          <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-4">FAVORITE AGENTS</h3>
          {byAgent.length === 0 ? <div className="text-xs text-slate-500">Use agents to populate this.</div> : byAgent.map(([id, n]) => (
            <button key={id} onClick={() => setView(`agent:${id}`)} className="w-full text-left p-2 rounded hover:bg-slate-100 flex items-center justify-between text-sm">
              <span className="capitalize">{id.replace(/-/g, " ")}</span>
              <span className="terminal-text text-trust-600">{n}×</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================== API DOCS PAGE =====================
function ApiPage() {
  const [keys, setKeys] = useState([]); const [newKey, setNewKey] = useState(null); const [label, setLabel] = useState(""); const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("overview");
  async function load() { const r = await api("/api/keys"); if (r.ok) setKeys(r.data.keys || []); }
  useEffect(() => { load(); }, []);
  async function create() { setCreating(true); const r = await api("/api/keys", { method: "POST", body: JSON.stringify({ label: label || "Default" }) }); setCreating(false); if (r.ok) { setNewKey(r.data.key); setLabel(""); load(); } }
  async function revoke(id) { await api(`/api/keys/${id}`, { method: "DELETE" }); load(); }

  const endpoints = [
    { method: "GET", path: "/api/services", desc: "List five marketplace security services.", auth: false },
    { method: "GET", path: "/api/stats/services", desc: "Per-service 30-day run counts and sparkline buckets.", auth: false },
    { method: "GET", path: "/api/agents", desc: "List all analysis engines (18 agents).", auth: false },
    { method: "GET", path: "/api/agents/:id", desc: "Get one agent's metadata, inputs, features.", auth: false },
    { method: "POST", path: "/api/agents/:id/run", desc: "Execute an agent. Requires auth + a paymentMethod.", auth: true },
    { method: "GET", path: "/api/reports", desc: "List your recent reports.", auth: true },
    { method: "GET", path: "/api/reports/:id", desc: "Fetch a single report.", auth: true },
    { method: "GET", path: "/api/subscriptions/plans", desc: "List subscription plans (Starter, Pro, Business).", auth: false },
    { method: "POST", path: "/api/subscriptions/subscribe", desc: "Subscribe to a plan with on-chain USDC payment.", auth: true },
    { method: "GET", path: "/api/payment/config", desc: "Returns USDC mint + destination wallet for payments.", auth: false },
    { method: "GET", path: "/api/exploits", desc: "Live exploit feed (DeFiLlama + curated fallback).", auth: false },
    { method: "GET", path: "/api/stats/overall", desc: "Platform-wide usage counters.", auth: false },
    { method: "GET", path: "/api/me", desc: "Current authenticated user with credits + subscription.", auth: true },
    { method: "POST", path: "/api/auth/nonce", desc: "Begin wallet-signed auth flow.", auth: false },
    { method: "POST", path: "/api/auth/verify", desc: "Verify Solana signature, returns JWT.", auth: false },
    { method: "GET", path: "/api/watchlist", desc: "Your monitored tokens (auto re-scan every 3 min).", auth: true },
    { method: "POST", path: "/api/watchlist", desc: "Add a token to your watchlist.", auth: true },
    { method: "GET", path: "/api/alerts/stream", desc: "Server-Sent Events for live alerts. Auth via ?token=JWT.", auth: true },
  ];

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="flex items-center gap-2 mb-2">
        <Code2 className="w-5 h-5 text-trust-600" />
        <h1 className="text-3xl font-bold text-slate-900">REST API</h1>
        <span className="text-[10px] px-2 py-0.5 rounded bg-trust-100 border border-trust-300 text-trust-700 terminal-text">v0.1.0</span>
      </div>
      <p className="text-slate-600 mb-6">Programmatic access to every SolGuard agent. Authenticate with an API key (subscription-backed) or JWT.</p>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {[["overview", "Overview"], ["endpoints", "Endpoints"], ["sdks", "SDKs"], ["keys", "Your Keys"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs terminal-text tracking-widest transition border-b-2 ${tab === k ? "border-trust-500 text-trust-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{l.toUpperCase()}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="font-bold mb-3">Base URL</h3>
            <pre className="text-sm terminal-text text-slate-200 bg-slate-900 p-3 rounded border border-slate-800">https://solguard.ai/api</pre>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="font-bold mb-3">Authentication</h3>
            <p className="text-sm text-slate-600 mb-3">Two methods. API keys are recommended for server-side use.</p>
            <pre className="text-xs terminal-text text-slate-200 bg-slate-900 p-3 rounded border border-slate-800 overflow-auto">{`# Via API key (recommended for backends — subscription-backed)
X-API-Key: sg_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Via JWT (browser / wallet-auth users)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`}</pre>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="font-bold mb-3">Payment Methods (when running an agent)</h3>
            <ul className="space-y-1.5 text-sm">
              <li><code className="text-trust-700">credit</code> · use one of your 2 non-renewable free credits</li>
              <li><code className="text-trust-700">subscription</code> · debit your active plan's quota (Starter 100 / Pro 1000 / Business unlimited)</li>
              <li><code className="text-trust-700">usdc</code> · provide <code>paymentSignature</code> of a confirmed 0.10 USDC transfer to our verification wallet</li>
            </ul>
          </div>
          <div className="p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="font-bold mb-3">Rate Limits</h3>
            <ul className="space-y-1.5 text-sm">
              <li>Per agent per user: <code className="text-trust-700">10 req/min</code> (free) · <code className="text-trust-700">60 req/min</code> (subscribers)</li>
              <li>Global per user: <code className="text-trust-700">60 req/min</code> (free) · <code className="text-trust-700">300 req/min</code> (subscribers)</li>
              <li>Public reads per IP: <code className="text-trust-700">120 req/min</code></li>
              <li>Auth endpoints per IP: <code className="text-trust-700">20 req/min</code></li>
            </ul>
            <p className="text-xs text-slate-500 mt-3">Exceeding limits returns <code>429</code> with a retry-after seconds hint in the body.</p>
          </div>
        </div>
      )}

      {tab === "endpoints" && (
        <div className="space-y-2">
          {endpoints.map((e, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200">
              <span className={`text-[10px] terminal-text font-bold w-14 text-center py-1 rounded ${e.method === "GET" ? "bg-emerald-50 text-emerald-700" : e.method === "POST" ? "bg-trust-50 text-trust-700" : "bg-rose-50 text-rose-700"}`}>{e.method}</span>
              <code className="terminal-text text-sm text-slate-700 flex-1">{e.path}</code>
              {e.auth && <span className="text-[10px] terminal-text text-amber-600">AUTH</span>}
              <span className="text-xs text-slate-500 hidden md:inline">{e.desc}</span>
            </div>
          ))}

          <div className="mt-6 p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="font-bold mb-3">Example: Run Token Audit</h3>
            <pre className="text-xs terminal-text text-slate-200 bg-slate-900 p-3 rounded border border-slate-800 overflow-auto">{`curl -X POST https://solguard.ai/api/agents/token-audit/run \\
  -H "X-API-Key: sg_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "inputs": { "tokenAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    "paymentMethod": "subscription"
  }'`}</pre>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="font-bold mb-3">Sample Response</h3>
            <pre className="text-xs terminal-text text-slate-200 bg-slate-900 p-3 rounded border border-slate-800 overflow-auto">{`{
  "reportId": "uuid…",
  "agentId": "token-audit",
  "agentName": "Token Audit",
  "summary": "This token shows low risk … PROCEED WITH CAUTION.",
  "riskScore": 25,
  "riskLevel": "LOW",
  "evidence": { … },
  "recommendations": [],
  "inputs": { "tokenAddress": "…" },
  "createdAt": "2025-06-25T…"
}`}</pre>
          </div>
        </div>
      )}

      {tab === "sdks" && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold flex items-center gap-2"><span className="text-amber-400">●</span> JavaScript SDK</h3>
                <a href="/sdk/solguard.js" download className="text-xs terminal-text px-3 py-1.5 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 transition flex items-center gap-1.5"><Download className="w-3 h-3" /> DOWNLOAD</a>
              </div>
              <pre className="text-xs terminal-text text-slate-200 bg-slate-900 p-3 rounded border border-slate-800 overflow-auto">{`import { SolGuard } from "./solguard.js";

const sg = new SolGuard({ apiKey: "sg_live_…" });
const r = await sg.runAgent("token-audit", {
  tokenAddress: "DezXAZ8z…"
}, { paymentMethod: "subscription" });
console.log(r.summary, r.riskScore);`}</pre>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold flex items-center gap-2"><span className="text-emerald-400">●</span> Python SDK</h3>
                <a href="/sdk/solguard.py" download className="text-xs terminal-text px-3 py-1.5 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 transition flex items-center gap-1.5"><Download className="w-3 h-3" /> DOWNLOAD</a>
              </div>
              <pre className="text-xs terminal-text text-slate-200 bg-slate-900 p-3 rounded border border-slate-800 overflow-auto">{`from solguard import SolGuard

sg = SolGuard(api_key="sg_live_…")
r = sg.run_agent(
  "token-audit",
  inputs={"tokenAddress": "DezXAZ8z…"},
  payment_method="subscription"
)
print(r["summary"], r["riskScore"])`}</pre>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
            <strong>Note:</strong> These are minimal reference SDKs (single-file, no dependencies). npm/PyPI packages are landing soon — these files are stable to use today.
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div className="space-y-5">
          <div className="p-5 rounded-xl border border-slate-200 bg-white">
            <h3 className="terminal-text tracking-widest text-sm text-slate-600 mb-3">CREATE API KEY</h3>
            <div className="flex gap-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Production bot)" className="flex-1 bg-white border border-slate-200 rounded-md px-4 py-2.5 text-sm outline-none focus:border-trust-500" />
              <button onClick={create} disabled={creating} className="px-4 rounded-md bg-trust-600 text-white font-bold hover:bg-trust-500 disabled:opacity-40 terminal-text tracking-wider text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> CREATE</button>
            </div>
            {newKey && (
              <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-xs terminal-text text-emerald-300 mb-2">⚠ COPY NOW — WON'T BE SHOWN AGAIN</div>
                <div className="font-mono text-sm bg-slate-900 text-slate-200 p-2 rounded break-all">{newKey}</div>
                <button onClick={() => { navigator.clipboard.writeText(newKey); setNewKey(null); }} className="mt-2 text-xs text-trust-700">COPY & DISMISS</button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {keys.length === 0 ? <div className="p-8 text-center text-slate-500">No keys yet.</div> : keys.map((k, i) => (
              <div key={k.id} className={`p-4 flex items-center justify-between ${i > 0 ? "border-t border-slate-200" : ""} ${!k.isActive ? "opacity-50" : ""}`}>
                <div>
                  <div className="font-bold">{k.label}</div>
                  <div className="text-xs font-mono text-slate-500 mt-1">{k.key}</div>
                  <div className="text-xs text-slate-500 mt-1">Used {k.usageCount}× · {new Date(k.createdAt).toLocaleDateString()}</div>
                </div>
                {k.isActive ? <button onClick={() => revoke(k.id)} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 hover:border-rose-500/40 hover:text-rose-400 flex items-center gap-1.5"><Trash2 className="w-3 h-3" /> REVOKE</button> : <span className="text-xs text-slate-500">REVOKED</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== TESTING MODE BANNER =====================
function TestingModeBanner() {
  return (
    <div
      className="fixed bottom-4 left-4 z-50 pointer-events-none px-3 py-2 rounded-lg border border-amber-400/80 bg-amber-50/95 text-amber-900 text-[11px] font-semibold tracking-wide shadow-md backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      TESTING MODE — Free Runs Enabled
    </div>
  );
}

// ===================== ROOT APP =====================
export default function App() {
  const [view, setView] = useState("home");
  const [user, setUser] = useState(null);
  const [agents, setAgents] = useState([]);
  const [services, setServices] = useState([]);
  const [serviceStats, setServiceStats] = useState({});
  const [exploits, setExploits] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [testingModeFreeRuns, setTestingModeFreeRuns] = useState(false);
  const [report, setReport] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [toasts, setToasts] = useState([]);
  const sseRef = useRef(null);

  async function refreshAll() {
    const [a, svc, svcStats, e, s, cfg] = await Promise.all([
      api("/api/agents"),
      api("/api/services"),
      api("/api/stats/services"),
      api("/api/exploits"),
      api("/api/stats/overall"),
      api("/api/config"),
    ]);
    if (a.ok) setAgents(a.data.agents);
    if (svc.ok) setServices(svc.data.services || []);
    if (svcStats.ok) {
      const map = {};
      for (const row of svcStats.data.services || []) map[row.serviceId] = row;
      setServiceStats(map);
    }
    if (e.ok) setExploits(e.data.exploits);
    if (s.ok) setOverallStats(s.data);
    if (cfg.ok) setTestingModeFreeRuns(!!cfg.data.testingModeFreeRuns);
  }
  async function refreshMe() {
    const tok = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
    if (!tok) return;
    const r = await api("/api/me");
    if (r.ok) setUser(r.data); else { localStorage.removeItem("sg_token"); setUser(null); }
  }
  useEffect(() => { refreshAll(); refreshMe(); }, []);

  useEffect(() => {
    const rid = typeof window !== "undefined" ? sessionStorage.getItem("sg_open_report") : null;
    if (!rid) return;
    sessionStorage.removeItem("sg_open_report");
    (async () => {
      const r = await api(`/api/reports/${rid}`);
      if (r.ok) { setReport(r.data); setView(`report:${rid}`); }
    })();
  }, []);

  useEffect(() => {
    const rid = typeof window !== "undefined" ? sessionStorage.getItem("sg_open_report") : null;
    if (!rid) return;
    sessionStorage.removeItem("sg_open_report");
    (async () => {
      const r = await api(`/api/reports/${rid}`);
      if (r.ok) { setReport(r.data); setView(`report:${rid}`); }
    })();
  }, []);

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
    <div className="min-h-screen grid-bg">
      {testingModeFreeRuns && <TestingModeBanner />}
      <Header view={view} setView={setView} user={user} onConnect={connectWallet} onLogout={logout} connecting={connecting} walletError={walletError} />

      {topView === "home" && <Home services={services} serviceStats={serviceStats} setView={setView} overallStats={overallStats} exploits={exploits} />}
      {topView === "explorer" && <Explorer services={services} serviceStats={serviceStats} setView={setView} />}
      {topView === "agent" && <AgentPage agentId={params} user={user} ensureWallet={connectWallet} testingModeFreeRuns={testingModeFreeRuns} onReport={(rep) => { setReport(rep); setView(`report:${rep.reportId}`); refreshMe(); refreshAll(); }} setView={setView} />}
      {topView === "report" && <ReportView report={report} setView={setView} />}
      {topView === "subscriptions" && <Subscriptions user={user} ensureWallet={connectWallet} onSubscribed={() => { refreshMe(); setView("dashboard"); }} />}
      {topView === "guide" && <Guide setView={setView} />}
      {topView === "watchlist" && user && <Watchlist setView={setView} />}
      {topView === "dashboard" && user && <Dashboard user={user} setView={(v) => { if (v.startsWith("report:")) { (async () => { const r = await api(`/api/reports/${v.split(":")[1]}`); if (r.ok) setReport(r.data); setView(v); })(); } else setView(v); }} overallStats={overallStats} />}
      {topView === "api" && <ApiPage />}
      {topView === "exploits" && <ExploitWatch setView={setView} />}

      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((a) => {
          const c = levelColor(a.newLevel);
          return (
            <div key={a.id} className={`pointer-events-auto p-4 rounded-xl border ${c.border} bg-white/95 backdrop-blur shadow-trust-md ${c.glow} min-w-[300px]`}>
              <div className="flex items-start gap-3">
                <Bell className={`w-5 h-5 ${c.text} mt-0.5`} />
                <div className="flex-1">
                  <div className="terminal-text text-xs tracking-widest text-slate-500">RISK LEVEL CHANGED</div>
                  <div className={`font-bold ${c.text} mt-1`}>{a.symbol || truncate(a.tokenAddress)}: {a.previousLevel} → {a.newLevel}</div>
                </div>
                <button onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} className="text-slate-500"><X className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
