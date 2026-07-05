"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandLogo from "../components/BrandLogo";
import { X402InlineTag } from "../components/X402ComingSoon";
import bs58 from "bs58";
import {
  CheckCircle2, Copy, Loader2, Zap, ChevronRight, Twitter, Bot, Fingerprint, KeyRound,
  Shield, Lock, Wallet, MessageSquare, Coins, Layers, Users, Droplets, FileText,
  Sparkles, ShieldAlert, TrendingUp, Activity, Globe, UserCog,
} from "lucide-react";
import { validateRunInputsForService, isRunInputValidForService } from "@/lib/solguard/runValidation";
import { ensurePhantomProvider, sendUsdcPayment } from "@/lib/solguard/usdcPaymentClient";
import { freeCreditButtonLabel } from "@/lib/solguard/credits";

const ICONS = {
  Coins, Lock, Layers, Users, Droplets, FileText, Sparkles, ShieldAlert, TrendingUp,
  Activity, Globe, Wallet, UserCog, Shield, MessageSquare, Bot, Fingerprint, KeyRound,
};

function authHeaders() {
  const t = typeof window !== "undefined" ? localStorage.getItem("sg_token") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    cache: "no-store",
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) },
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

export default function ServiceDetailPage({ serviceId }) {
  const router = useRouter();
  const [detail, setDetail] = useState(null);
  const [user, setUser] = useState(null);
  const [testingMode, setTestingMode] = useState(false);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [walletError, setWalletError] = useState("");

  useEffect(() => {
    setDetail(null);
    setInputs({});
    setError("");
    setWalletError("");
    let active = true;
    (async () => {
      const [d, cfg, me] = await Promise.all([
        api(`/api/services/${serviceId}`),
        api("/api/config"),
        api("/api/me"),
      ]);
      if (!active) return;
      if (d.ok) {
        if (d.data.id !== serviceId) return;
        setDetail(d.data);
        const init = {};
        for (const i of d.data.agent?.inputs || []) init[i.key] = "";
        setInputs(init);
      }
      if (cfg.ok) setTestingMode(!!cfg.data.testingModeFreeRuns);
      if (me.ok) setUser(me.data);
    })();
    return () => { active = false; };
  }, [serviceId]);

  async function connectWallet() {
    setWalletError("");
    setConnecting(true);
    try {
      const provider = window.solana;
      if (!provider?.isPhantom) throw new Error("Phantom wallet not detected");
      if (!provider.isConnected) await provider.connect();
      const nonceRes = await api("/api/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ walletAddress: provider.publicKey.toBase58() }),
      });
      if (!nonceRes.ok) throw new Error(nonceRes.data?.error || "Auth failed");
      const { nonce, message } = nonceRes.data;
      const encoded = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encoded, "utf8");
      const verifyRes = await api("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: provider.publicKey.toBase58(),
          signature: bs58.encode(signature),
          nonce,
        }),
      });
      if (!verifyRes.ok) throw new Error(verifyRes.data?.error || "Verification failed");
      localStorage.setItem("sg_token", verifyRes.data.token);
      setUser(verifyRes.data.user);
    } catch (e) {
      setWalletError(e.message || "Wallet connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function runAgent() {
    setError("");
    if (!user) { await connectWallet(); return; }
    const agent = detail?.agent;
    if (!agent || detail.id !== serviceId) return;

    const validated = validateRunInputsForService(serviceId, inputs);
    if (validated.error) { setError(validated.error); return; }

    setBusy(true);
    try {
      let paymentMethod = testingMode ? "testing" : "usdc";
      let paymentSignature = null;
      // Payment only — validation above is identical in testing and normal mode
      if (!testingMode && (user.credits || 0) <= 0 && !user.subscription) {
        const provider = await ensurePhantomProvider();
        paymentSignature = await sendUsdcPayment({ amountUsdc: agent.price, walletProvider: provider });
      } else if (!testingMode && (user.credits || 0) > 0) {
        paymentMethod = "credit";
      } else if (!testingMode && user.subscription) {
        paymentMethod = "subscription";
      }

      const r = await api(`/api/agents/${agent.id}/run`, {
        method: "POST",
        body: JSON.stringify({ inputs: validated.inputs, paymentMethod, paymentSignature }),
      });
      if (!r.ok) throw new Error(r.data?.error || "Run failed");
      const me = await api("/api/me");
      if (me.ok) setUser(me.data);
      const proofId = r.data.rawEvidence?.proof_id || r.data.rawEvidence?.proofId;
      if (proofId) {
        router.push(`/verify/${proofId}`);
        return;
      }
      sessionStorage.setItem("sg_open_report", r.data.reportId);
      router.push("/");
    } catch (e) {
      setError(e.message || "Run failed");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-trust-600" />
      </div>
    );
  }

  const agent = detail.agent;
  const Icon = ICONS[agent.icon] || Shield;
  const formValid = isRunInputValidForService(serviceId, inputs);
  const creditLabel = !testingMode ? freeCreditButtonLabel(user?.credits) : null;
  const shareUrl = typeof window !== "undefined" ? window.location.href : `https://solguard.ai/services/${serviceId}`;

  function copyCurl() {
    navigator.clipboard.writeText(detail.curlExample || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen grid-bg">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex-shrink-0"><BrandLogo size="sm" /></Link>
          <div className="flex items-center gap-3">
            {user ? (
              <span className="text-xs text-slate-600 hidden sm:inline flex items-center gap-1.5">
                <span>{user.walletAddress?.slice(0, 4)}…{user.walletAddress?.slice(-4)}</span>
                {(user.credits || 0) > 0 && (
                  <span className="text-trust-600 font-medium">{user.credits} cr</span>
                )}
              </span>
            ) : (
              <button onClick={connectWallet} disabled={connecting} className="text-xs px-3 py-1.5 rounded-md border border-trust-300 text-trust-700 hover:bg-trust-50">
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
            <Link href="/?view=explorer" className="text-xs text-trust-600 hover:text-trust-700">Explorer →</Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <nav className="text-xs text-slate-500 mb-6 flex items-center gap-1 flex-wrap">
          <Link href="/?view=explorer" className="hover:text-trust-600">Services</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700">{detail.name}</span>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#0B2545] flex items-center justify-center flex-shrink-0">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{detail.name}</h1>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 border border-slate-200 text-slate-600">{detail.category}</span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">{detail.canonicalPath}</p>
                <p className="text-slate-600 mt-4 leading-relaxed">{agent.longDescription || agent.description || detail.description}</p>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${detail.name} on SolGuard AI`)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs text-slate-500 hover:text-trust-600"
                >
                  <Twitter className="w-3.5 h-3.5" /> Share
                </a>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Features</h2>
              <ul className="space-y-2">
                {(agent.features || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-trust-600 flex-shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Returns</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2 font-medium">Field</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.returns || []).map((row) => (
                      <tr key={row.field} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2 font-mono text-xs text-trust-700">{row.field}</td>
                        <td className="px-4 py-2 text-slate-500">{row.type}</td>
                        <td className="px-4 py-2 text-slate-600">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Call it directly</h2>
              <div className="relative rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <button type="button" onClick={copyCurl} className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1">
                  <Copy className="w-3 h-3" /> {copied ? "Copied" : "Copy"}
                </button>
                <pre className="p-4 pt-10 text-xs text-emerald-300 overflow-x-auto font-mono whitespace-pre-wrap">{detail.curlExample}</pre>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                POST JSON to <code className="text-slate-600">{detail.canonicalPath}</code> · Wallet JWT required · Unpaid requests return 402 · USDC on Solana
              </p>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-trust-sm p-6 sticky top-24">
              <h2 className="text-sm font-bold text-slate-900 mb-1">Try it</h2>
              <p className="text-xs text-slate-500 mb-4">Connect wallet to run · Pay per call in USDC</p>

              <div className="mb-4">
                <div className="text-3xl font-bold text-slate-900">
                  {testingMode ? "FREE" : `$${agent.price.toFixed(2)}`}
                </div>
                <div className="text-xs text-slate-500">{testingMode ? "testing mode active" : "per call · USDC on Solana"}</div>
                <div className="mt-2"><X402InlineTag /></div>
              </div>

              {agent.inputs.map((inp) => (
                <div key={inp.key} className="mb-3">
                  <label className="text-xs text-slate-500 block mb-1">{inp.label}</label>
                  {inp.multiline ? (
                    <textarea
                      value={inputs[inp.key] || ""}
                      onChange={(e) => {
                        setError("");
                        setInputs((prev) => {
                          const next = { [inp.key]: e.target.value };
                          for (const field of agent.inputs) {
                            if (field.key !== inp.key) next[field.key] = prev[field.key] ?? "";
                          }
                          return next;
                        });
                      }}
                      placeholder={inp.placeholder}
                      rows={4}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-trust-500"
                    />
                  ) : (
                    <input
                      value={inputs[inp.key] || ""}
                      onChange={(e) => {
                        setError("");
                        setInputs((prev) => {
                          const next = { [inp.key]: e.target.value };
                          for (const field of agent.inputs) {
                            if (field.key !== inp.key) next[field.key] = prev[field.key] ?? "";
                          }
                          return next;
                        });
                      }}
                      placeholder={inp.placeholder}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm outline-none focus:border-trust-500"
                    />
                  )}
                  {inp.example && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setInputs((prev) => {
                          const next = { ...prev, [inp.key]: inp.example };
                          for (const field of agent.inputs) {
                            if (!(field.key in next)) next[field.key] = "";
                          }
                          return next;
                        });
                      }}
                      className="text-[11px] text-trust-600 mt-1"
                    >
                      Use example →
                    </button>
                  )}
                </div>
              ))}

              {(error || walletError) && <p className="text-xs text-rose-500 mb-3">⚠ {error || walletError}</p>}

              <button
                type="button"
                onClick={runAgent}
                disabled={!formValid || busy}
                className="w-full py-3 rounded-md bg-trust-600 text-white font-bold text-sm hover:bg-trust-500 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {user
                  ? (testingMode ? "Run (free)" : (creditLabel || "Pay & run"))
                  : "Connect wallet & run"}
              </button>

              <Link href="/?view=subscriptions" className="block text-center text-xs text-trust-600 hover:text-trust-700 mt-3">
                or prepay with a subscription →
              </Link>

              <dl className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">SLA</dt><dd className="text-slate-700">{detail.sla}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Network</dt><dd className="text-slate-700">{detail.network}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Settlement</dt><dd className="text-slate-700">{detail.settlement}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">x402</dt><dd className="text-slate-500">{detail.settlementNote}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
