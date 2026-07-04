"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import { CheckCircle2, Loader2, XCircle, Shield } from "lucide-react";

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, data };
}

export default function VerifyProofClient({ proofId }) {
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    if (!proofId) return;
    (async () => {
      const r = await api(`/api/verify/proof/${proofId}`);
      if (r.ok) setMeta(r.data);
      else setLoadErr(r.data?.error || "Proof not found");
    })();
  }, [proofId]);

  async function verify() {
    setBusy(true);
    setResult(null);
    const r = await api(`/api/verify/proof/${proofId}`, {
      method: "POST",
      body: JSON.stringify({ data }),
    });
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setResult({ matched: false, error: r.data?.error });
  }

  return (
    <div className="min-h-screen grid-bg">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/"><BrandLogo size="sm" /></Link>
          <Link href="/services/private-data-verification" className="text-xs text-trust-600">Service →</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="flex items-center gap-2 text-trust-600 mb-2">
          <Shield className="w-5 h-5" />
          <span className="text-xs font-semibold tracking-widest uppercase">Integrity verification</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Verify data commitment</h1>
        <p className="text-sm text-slate-600 mb-6">
          Cryptographic integrity proof (SHA-256 salted commitment) — not a zero-knowledge proof.
          Submit your copy of the data to check it matches the stored commitment.
        </p>

        {loadErr && <p className="text-rose-500 text-sm mb-4">{loadErr}</p>}

        {meta && (
          <div className="rounded-xl bg-white border border-slate-200 p-4 mb-6 text-sm space-y-1">
            <div><span className="text-slate-500">Proof ID:</span> <span className="font-mono text-xs">{meta.proofId}</span></div>
            <div><span className="text-slate-500">Algorithm:</span> {meta.algorithm}</div>
            <div><span className="text-slate-500">Created:</span> {new Date(meta.createdAt).toLocaleString()}</div>
            <p className="text-xs text-slate-500 pt-2">{meta.note}</p>
          </div>
        )}

        <label className="text-xs text-slate-500 block mb-1">Your copy of the original data</label>
        <textarea
          value={data}
          onChange={(e) => setData(e.target.value)}
          rows={6}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono mb-4 focus:border-trust-500 outline-none"
          placeholder="Paste the exact data that was committed…"
        />

        <button
          type="button"
          onClick={verify}
          disabled={!data.trim() || busy || !meta}
          className="px-6 py-2.5 rounded-md bg-trust-600 text-white font-semibold text-sm hover:bg-trust-500 disabled:opacity-40 flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Verify match
        </button>

        {result && !result.error && (
          <div className={`mt-6 p-4 rounded-xl border flex items-start gap-3 ${result.matched ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
            {result.matched ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
            <div>
              <p className="font-semibold text-slate-900">{result.matched ? "Match — data integrity confirmed" : "No match — data differs from commitment"}</p>
              <p className="text-xs text-slate-600 mt-1">Algorithm: {result.algorithm} · Checked {result.verifiedAt}</p>
            </div>
          </div>
        )}
        {result?.error && <p className="mt-4 text-sm text-rose-500">{result.error}</p>}
      </div>
    </div>
  );
}
