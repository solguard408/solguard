/**
 * Official SolGuard token — single source of truth for the homepage CA card.
 * Do not invent alternate addresses; edit only from a verified source.
 */
export const SOLGUARD_OFFICIAL_TOKEN_CA = "Uki1vacqqnJpCfhPpbzj2xCjJ6x5EGFig4LjTJfpump";

export const SOLGUARD_OFFICIAL_TOKEN_PUMPFUN_URL = `https://pump.fun/coin/${SOLGUARD_OFFICIAL_TOKEN_CA}`;

export const SOLGUARD_OFFICIAL_TOKEN_DEXSCREENER_URL = `https://dexscreener.com/solana/${SOLGUARD_OFFICIAL_TOKEN_CA}`;

/** Display truncation for compact UI; always copy the full CA. */
export function truncateTokenCa(ca = SOLGUARD_OFFICIAL_TOKEN_CA, head = 6, tail = 5) {
  if (!ca || ca.length <= head + tail + 3) return ca;
  return `${ca.slice(0, head)}…${ca.slice(-tail)}`;
}
