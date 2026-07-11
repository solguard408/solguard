/**
 * SolGuard AI — Official JavaScript SDK (v0.1.0)
 * Browser + Node.js compatible. Requires a fetch implementation.
 *
 * Usage:
 *   import { SolGuard } from "./solguard.js";
 *   const sg = new SolGuard({ apiKey: "sg_live_..." }); // or { token: "jwt..." }
 *   const agents = await sg.listAgents();
 *   const report = await sg.runAgent("token-audit", { tokenAddress: "..." }, { paymentMethod: "subscription" });
 */
export class SolGuard {
  constructor({ baseUrl = "https://www.solguard.space/api", apiKey = null, token = null, timeoutMs = 30000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }
  _headers(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    if (this.token)  h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
  async _req(method, path, body) {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.baseUrl + path, { method, headers: this._headers(), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(data?.error || `HTTP ${res.status}`);
        err.status = res.status; err.body = data;
        throw err;
      }
      return data;
    } finally { clearTimeout(id); }
  }
  // -------- Public --------
  listAgents()                 { return this._req("GET", "/agents"); }
  getAgent(id)                 { return this._req("GET", `/agents/${encodeURIComponent(id)}`); }
  listSubscriptionPlans()      { return this._req("GET", "/subscriptions/plans"); }
  getPaymentConfig()           { return this._req("GET", "/payment/config"); }
  getExploits()                { return this._req("GET", "/exploits"); }
  getOverallStats()            { return this._req("GET", "/stats/overall"); }
  // -------- Authed --------
  me()                         { return this._req("GET", "/me"); }
  listReports()                { return this._req("GET", "/reports"); }
  getReport(id)                { return this._req("GET", `/reports/${encodeURIComponent(id)}`); }
  listKeys()                   { return this._req("GET", "/keys"); }
  createKey(label)             { return this._req("POST", "/keys", { label }); }
  revokeKey(id)                { return this._req("DELETE", `/keys/${encodeURIComponent(id)}`); }
  // -------- Run an agent --------
  // paymentMethod: "credit" | "subscription" | "usdc". paymentSignature required for usdc.
  runAgent(agentId, inputs, { paymentMethod = "subscription", paymentSignature = null } = {}) {
    return this._req("POST", `/agents/${encodeURIComponent(agentId)}/run`, { inputs, paymentMethod, paymentSignature });
  }
  // -------- Subscriptions / Watchlist --------
  subscribe(plan, paymentSignature) { return this._req("POST", "/subscriptions/subscribe", { plan, paymentSignature }); }
  listWatchlist()                   { return this._req("GET", "/watchlist"); }
  addToWatchlist(tokenAddress)      { return this._req("POST", "/watchlist", { tokenAddress }); }
  removeFromWatchlist(tokenAddress) { return this._req("DELETE", `/watchlist/${encodeURIComponent(tokenAddress)}`); }
}
export default SolGuard;
