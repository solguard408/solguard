/** Permanent product trial — granted once on first wallet signup (not testing mode). */
export const SIGNUP_FREE_CREDITS = 2;

/** @param {number} credits */
export function freeCreditButtonLabel(credits) {
  const n = credits || 0;
  if (n <= 0) return null;
  if (n === 1) return "Run (1 free credit left)";
  return `Run (${n} free credits left)`;
}
