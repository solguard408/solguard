// Input sanitization helpers — strip control chars, enforce length caps, block SSRF.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeString(v, maxLen = 200) {
  if (typeof v !== "string") return "";
  return v.replace(CONTROL_CHARS, "").trim().slice(0, maxLen);
}

export function sanitizeQuery(v) {
  // Strip HTML tags + control chars, cap at 1000 chars
  if (typeof v !== "string") return "";
  return v.replace(/<[^>]*>/g, "").replace(CONTROL_CHARS, "").trim().slice(0, 1000);
}

// SSRF guard for the website-security agent.
// Blocks private/loopback IPs and non-http(s) schemes.
export function sanitizeUrl(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return { error: "URL too long or invalid" };
  let u;
  try { u = new URL(raw.trim()); } catch { return { error: "Invalid URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Only http/https URLs allowed" };
  const host = u.hostname.toLowerCase();
  // Block hostname patterns commonly used for SSRF
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { error: "Internal hosts blocked" };
  }
  // Block raw IPv4 in private ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10) return { error: "Private IP range blocked" };
    if (a === 127) return { error: "Loopback IP blocked" };
    if (a === 169 && b === 254) return { error: "Link-local IP blocked" };
    if (a === 192 && b === 168) return { error: "Private IP range blocked" };
    if (a === 172 && b >= 16 && b <= 31) return { error: "Private IP range blocked" };
    if (a === 0) return { error: "Invalid IP" };
  }
  // Block IPv6 loopback / link-local
  if (host === "::1" || host.startsWith("[fe80") || host.startsWith("fe80:")) return { error: "Loopback/link-local IPv6 blocked" };
  return { url: u.toString() };
}

// Generic agent input cleaner: applies type-specific sanitizers based on key name.
export function sanitizeAgentInputs(inputs) {
  const cleaned = {};
  for (const [k, v] of Object.entries(inputs || {})) {
    if (k === "url") {
      const r = sanitizeUrl(v);
      if (r.error) return { error: r.error };
      cleaned[k] = r.url;
    } else if (k === "query") {
      cleaned[k] = sanitizeQuery(v);
    } else {
      cleaned[k] = sanitizeString(v, 100);
    }
  }
  return { inputs: cleaned };
}
