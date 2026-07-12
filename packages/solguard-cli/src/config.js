import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

export const DEFAULT_BASE_URL = "https://www.solguard.space/api";
export const LOCAL_DEV_URL = "http://localhost:3000/api";

function isLocalUrl(url) {
  return /localhost|127\.0\.0\.1/i.test(url || "");
}

/** Resolve API base: --api flag > SOLGUARD_API env > config > local dev probe > production. */
export async function resolveBaseUrl(config, cliArgs = process.argv.slice(2)) {
  const flagIdx = cliArgs.findIndex((a) => a === "--api" || a === "-a");
  if (flagIdx >= 0 && cliArgs[flagIdx + 1]) {
    return cliArgs[flagIdx + 1].replace(/\/$/, "");
  }
  if (process.env.SOLGUARD_API) {
    return process.env.SOLGUARD_API.replace(/\/$/, "");
  }
  // Prefer a saved non-default URL, but never stick on dead localhost.
  if (config?.baseUrl && config.baseUrl !== DEFAULT_BASE_URL) {
    const saved = config.baseUrl.replace(/\/$/, "");
    if (!isLocalUrl(saved)) return saved;
    if (await probeApi(saved)) return saved;
  }
  if (await probeApi(LOCAL_DEV_URL)) {
    return LOCAL_DEV_URL;
  }
  return DEFAULT_BASE_URL;
}

async function probeApi(baseUrl) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export function configDir() {
  return path.join(os.homedir(), ".solguard");
}

export function configPath() {
  return path.join(configDir(), "config.json");
}

export function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = configPath();
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows may not support chmod — best effort only
  }
}

export function ensureConfig() {
  let config = loadConfig();
  if (!config) {
    config = {
      cliInstallId: crypto.randomUUID(),
      token: null,
      baseUrl: DEFAULT_BASE_URL,
      savedKeys: {},
    };
    saveConfig(config);
  }
  if (!config.cliInstallId) {
    config.cliInstallId = crypto.randomUUID();
    saveConfig(config);
  }
  if (!config.baseUrl) config.baseUrl = DEFAULT_BASE_URL;
  if (!config.savedKeys) config.savedKeys = {};
  return config;
}

export function updateConfig(patch) {
  const config = { ...ensureConfig(), ...patch };
  saveConfig(config);
  return config;
}
