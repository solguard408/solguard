const TIMEOUT_MS = 120_000;

async function request(baseUrl, path, { method = "GET", token, body } = {}) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
    } catch (e) {
      const hint =
        baseUrl.includes("localhost")
          ? "Is the dev server running? Try: npm run dev"
          : "For local dev: npm run dev, then SOLGUARD_API=http://localhost:3000/api node bin/solguard-cli.js";
      const err = new Error(`Could not reach SolGuard API at ${baseUrl} (${e?.cause?.code || e?.message || "network error"}). ${hint}`);
      err.cause = e;
      throw err;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status} from ${url}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function registerCli(baseUrl, cliInstallId) {
  return request(baseUrl, "/auth/cli", {
    method: "POST",
    body: { cliInstallId },
  });
}

export async function fetchConfig(baseUrl) {
  return request(baseUrl, "/config");
}

export async function fetchServices(baseUrl) {
  const data = await request(baseUrl, "/services");
  return data.services || [];
}

export async function fetchServiceDetail(baseUrl, serviceId) {
  return request(baseUrl, `/services/${encodeURIComponent(serviceId)}`);
}

export async function fetchMe(baseUrl, token) {
  return request(baseUrl, "/me", { token });
}

export async function runAgentFree(baseUrl, token, agentId, inputs, paymentMethod) {
  return request(baseUrl, `/agents/${encodeURIComponent(agentId)}/run`, {
    method: "POST",
    token,
    body: { inputs, paymentMethod },
  });
}

export async function ensureAuth(config) {
  if (config.token) {
    try {
      const me = await fetchMe(config.baseUrl, config.token);
      return { ...config, credits: me.credits, userId: me.id };
    } catch (e) {
      if (e.status !== 401) throw e;
    }
  }
  const reg = await registerCli(config.baseUrl, config.cliInstallId);
  return {
    ...config,
    token: reg.token,
    credits: reg.user?.credits ?? 0,
    userId: reg.user?.id,
  };
}
