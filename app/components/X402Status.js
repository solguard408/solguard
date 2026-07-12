import { Zap } from "lucide-react";

/** Canonical public x402 framing — real money today is USDC/credits/subscription, not x402. */
export const X402_TOOLTIP =
  "HTTP-native micropayments on Solana devnet. Mainnet x402 coming soon. Real mainnet payments today use credits, subscription, or USDC transfer.";

export const X402_HERO =
  "x402 payment gateway — live on Solana devnet across all agents · mainnet coming soon";

export const X402_CHIP = "x402 gateway (devnet live)";

export const X402_INLINE_DEVNET = "x402 · live on devnet";

export const X402_FOOTER_USDC = "Pay-per-use verification · USDC on Solana mainnet (live today)";

export const X402_FOOTER_X402 = "x402 gateway live on Solana devnet · mainnet x402 coming soon";

const badgeBase = "font-mono text-[10px] sm:text-[11px] tracking-wide";

/** Hero pill — below marketplace badge */
export function X402HeroPill({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] sm:text-xs ${badgeBase} ${className}`}
      title={X402_TOOLTIP}
    >
      <Zap className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden />
      {X402_HERO}
    </span>
  );
}

/** Inline tag near price displays on agent cards / detail */
export function X402InlineTag({ enabled = false, className = "" }) {
  if (enabled) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-[9px] sm:text-[10px] text-emerald-700 ${badgeBase} ${className}`}
        title={X402_TOOLTIP}
      >
        <Zap className="w-2.5 h-2.5 shrink-0" aria-hidden />
        {X402_INLINE_DEVNET}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[9px] sm:text-[10px] text-slate-600 ${badgeBase} ${className}`}
      title="Real mainnet payments use credits, subscription, or USDC transfer"
    >
      USDC on mainnet
    </span>
  );
}

/** Credibility-strip chip */
export function X402Chip({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-[10px] sm:text-[11px] text-emerald-800 ${badgeBase} ${className}`}
      title={X402_TOOLTIP}
    >
      <Zap className="w-3 h-3 shrink-0" aria-hidden />
      {X402_CHIP}
    </span>
  );
}

/** Roadmap / what's-next list item — mainnet is the next phase */
export function X402RoadmapItem() {
  return (
    <li className="flex gap-3 p-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex-shrink-0 w-8 h-8 rounded-full border border-emerald-200 bg-emerald-50 flex items-center justify-center">
        <Zap className="w-4 h-4 text-emerald-600" aria-hidden />
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h3 className="font-bold text-slate-900 text-sm">x402 on Solana mainnet</h3>
          <X402InlineTag enabled />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          The x402 payment gateway is live on Solana devnet across all agents today. Mainnet cutover is the next
          phase — automatic HTTP-native micropayments without manual transaction signing. Real-money payments today
          use credits, subscription, or USDC transfer.
        </p>
      </div>
    </li>
  );
}

/** Footer tagline — structured for readable line breaks */
export function X402FooterTagline() {
  return (
    <>
      <span className="block sm:inline">{X402_FOOTER_USDC}</span>
      <span className="hidden sm:inline"> · </span>
      <span className="block sm:inline">{X402_FOOTER_X402}</span>
    </>
  );
}
