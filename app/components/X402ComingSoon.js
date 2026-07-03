import { Clock, Zap } from "lucide-react";

const base = "terminal-text tracking-wide";

/** Hero teaser pill — below marketplace badge */
export function X402HeroPill({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-[10px] sm:text-xs ${base} ${className}`}
    >
      <Zap className="w-3 h-3 text-trust-500 shrink-0" aria-hidden />
      X402 PAYMENTS — COMING SOON
    </span>
  );
}

/** Inline tag near price displays on agent cards / detail */
export function X402InlineTag({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-slate-300 bg-slate-50 text-[9px] sm:text-[10px] text-slate-500 ${base} ${className}`}
      title="HTTP-native pay-per-request via x402 — not live yet"
    >
      <Clock className="w-2.5 h-2.5 shrink-0" aria-hidden />
      x402 coming soon
    </span>
  );
}

/** Credibility-strip chip (dashed, muted — clearly not live) */
export function X402Chip({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-slate-300 bg-slate-50 text-[10px] sm:text-[11px] text-slate-500 ${base} ${className}`}
    >
      <Clock className="w-3 h-3 shrink-0" aria-hidden />
      x402 Protocol (Coming Soon)
    </span>
  );
}

/** Roadmap / what's-next list item */
export function X402RoadmapItem() {
  return (
    <li className="flex gap-3 p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/80">
      <div className="flex-shrink-0 w-8 h-8 rounded-full border border-dashed border-slate-300 bg-white flex items-center justify-center">
        <Clock className="w-4 h-4 text-slate-400" aria-hidden />
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="font-bold text-slate-900 text-sm">x402 Payments</h3>
          <X402InlineTag />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Pay-per-request over HTTP — no manual transaction signing. Agents pay automatically via the x402 payment handshake.
        </p>
      </div>
    </li>
  );
}

/** Footer tagline fragment */
export function X402FooterTagline() {
  return (
    <>
      Pay-per-use verification over{" "}
      <span className="text-slate-500">x402 (coming soon)</span>
      {" · "}
      <a href="#" className="underline underline-offset-2 decoration-slate-400 text-slate-600 hover:text-slate-800">
        USDC
      </a>
      {" · "}Solana mainnet
    </>
  );
}
