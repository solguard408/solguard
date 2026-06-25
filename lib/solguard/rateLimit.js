// Simple in-process token bucket rate limiter (sufficient for single-instance MVP).
// Buckets keyed by `${scope}:${id}`. Each bucket: { count, windowStart }.
// Use Redis for multi-instance production.

const BUCKETS = new Map();

function take({ key, max, windowMs }) {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || now - b.windowStart > windowMs) {
    BUCKETS.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: max - 1, resetIn: windowMs };
  }
  if (b.count >= max) {
    return { ok: false, remaining: 0, resetIn: windowMs - (now - b.windowStart) };
  }
  b.count += 1;
  return { ok: true, remaining: max - b.count, resetIn: windowMs - (now - b.windowStart) };
}

// Periodically prune old buckets so memory doesn't grow unbounded
if (typeof globalThis.__rlPrune === "undefined") {
  globalThis.__rlPrune = setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of BUCKETS) if (v.windowStart < cutoff) BUCKETS.delete(k);
  }, 60_000);
}

// Per-user-per-agent: 10 runs/min (premium subscribers get higher)
export function checkAgentRunLimit({ userId, agentId, isPremium = false }) {
  return take({ key: `run:${userId}:${agentId}`, max: isPremium ? 60 : 10, windowMs: 60_000 });
}
// Global per-user across all agents: 60 runs/min
export function checkUserGlobalLimit({ userId, isPremium = false }) {
  return take({ key: `user:${userId}`, max: isPremium ? 300 : 60, windowMs: 60_000 });
}
// Per-IP auth nonce: 20/min
export function checkIpAuthLimit({ ip }) {
  return take({ key: `auth:${ip}`, max: 20, windowMs: 60_000 });
}
// Per-IP public reads: 120/min
export function checkIpPublicLimit({ ip }) {
  return take({ key: `pub:${ip}`, max: 120, windowMs: 60_000 });
}
