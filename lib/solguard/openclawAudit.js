/** Rule-based static analysis of OpenClaw-style AI agent JSON configs. */

function parseAgentConfig(raw) {
  if (raw == null) throw new Error("Config is required");
  if (typeof raw === "object") return raw;
  const trimmed = String(raw).trim();
  if (!trimmed) throw new Error("Config is required");
  let outer = JSON.parse(trimmed);
  if (typeof outer.config === "string") {
    try {
      outer = JSON.parse(outer.config);
    } catch {
      throw new Error("Nested config string is not valid JSON");
    }
  }
  return outer;
}

const RISKY_TOOLS = new Set([
  "http", "fetch", "axios", "curl", "shell", "exec", "bash", "cmd",
  "filesystem", "fs", "read", "write", "file", "spawn", "subprocess",
  "network", "socket", "wget",
]);

const WEAK_AUTH = new Set(["none", "null", "disabled", "open", "public", ""]);

function walkStrings(obj, out = []) {
  if (obj == null) return out;
  if (typeof obj === "string") {
    out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) walkStrings(v, out);
    return out;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) walkStrings(v, out);
  }
  return out;
}

export function analyzeOpenClawConfig(rawConfig) {
  let config;
  try {
    config = parseAgentConfig(rawConfig);
  } catch (e) {
    return { error: e.message || "Invalid JSON config" };
  }

  const findings = [];
  const recommendations = [];
  let score = 0;

  const gateway = config.gateway || config.auth || {};
  const authVal = (
    gateway.auth ??
    gateway.authentication ??
    config.auth ??
    config.authentication ??
    null
  );
  const authStr = authVal == null ? "" : String(authVal).toLowerCase();

  if (authStr === "" || WEAK_AUTH.has(authStr)) {
    score += 45;
    findings.push({
      label: "Authentication",
      value: authStr === "" ? "Missing" : `"${authVal}"`,
      impact: "+45 risk",
      explanation: "Gateway accepts connections without meaningful authentication, allowing unauthorized agent control.",
    });
    recommendations.push("Require API keys, OAuth, or mTLS on the agent gateway before production use.");
  } else if (["basic", "password", "token"].includes(authStr)) {
    score += 15;
    findings.push({
      label: "Authentication",
      value: String(authVal),
      impact: "+15 risk",
      explanation: "Authentication mode may be weak without rate limits, rotation, and TLS enforcement.",
    });
    recommendations.push("Use short-lived tokens with rotation and enforce HTTPS-only gateway access.");
  } else {
    findings.push({
      label: "Authentication",
      value: String(authVal),
      impact: "neutral",
      explanation: "An explicit authentication mode is configured on the gateway.",
    });
  }

  const toolList = [
    ...(Array.isArray(config.tools) ? config.tools : []),
    ...(Array.isArray(config.skills) ? config.skills : []),
  ].map((t) => (typeof t === "string" ? t : t?.name || t?.id || JSON.stringify(t)).toLowerCase());

  const risky = toolList.filter((t) => [...RISKY_TOOLS].some((r) => t.includes(r)));
  if (risky.length) {
    score += Math.min(40, risky.length * 12);
    findings.push({
      label: "Tool Permissions",
      value: risky.slice(0, 6).join(", ") + (risky.length > 6 ? "…" : ""),
      impact: "+40 risk",
      explanation: "Tools with network, shell, or filesystem access can exfiltrate data or execute arbitrary commands.",
    });
    recommendations.push("Remove or sandbox high-privilege tools; allowlist only required HTTP endpoints.");
  } else {
    findings.push({
      label: "Tool Permissions",
      value: toolList.length ? `${toolList.length} tool(s) listed` : "None declared",
      impact: "neutral",
      explanation: "No obvious unrestricted shell/filesystem tools were declared in the config.",
    });
  }

  const strings = walkStrings(config);
  const injectionPatterns = strings.filter((s) =>
    /\{\{\s*user\s*\}\}|\$\{.*user|\{\{\s*input\s*\}\}|raw\s*:\s*true|unsanitized/i.test(s)
  );
  if (injectionPatterns.length) {
    score += 25;
    findings.push({
      label: "Injection Surface",
      value: `${injectionPatterns.length} pattern(s) detected`,
      impact: "+25 risk",
      explanation: "Raw user placeholders or unsanitized message-passing can enable prompt injection or template abuse.",
    });
    recommendations.push("Sanitize and validate all user input before passing it to tools or system prompts.");
  } else {
    findings.push({
      label: "Injection Surface",
      value: "No raw user placeholders found",
      impact: "neutral",
      explanation: "No obvious unsanitized user-input templates were detected in the config strings.",
    });
  }

  const session = config.sessionId ?? config.session ?? config.sessions;
  const sessionIssues = [];
  if (session != null && typeof session === "string" && session.length < 16) {
    sessionIssues.push("predictable session id");
  }
  if (config.persistSession === true || config.sessionPersist === true) {
    sessionIssues.push("persistent sessions without expiry");
  }
  if (sessionIssues.length) {
    score += 20;
    findings.push({
      label: "Session Handling",
      value: sessionIssues.join("; "),
      impact: "+20 risk",
      explanation: "Weak session identifiers or indefinite persistence increase hijacking and replay risk.",
    });
    recommendations.push("Use cryptographically random session IDs with explicit TTL and rotation.");
  } else {
    findings.push({
      label: "Session Handling",
      value: session ? "Configured" : "Not specified",
      impact: "neutral",
      explanation: "No obvious session fixation or persistence issues were detected in the config structure.",
    });
  }

  score = Math.min(100, score);
  const riskLevel = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const agentName = config.name || "unnamed agent";
  const verdict =
    score >= 60
      ? `The "${agentName}" configuration has critical gaps — ${findings.filter((f) => f.impact.includes("+")).length} high-risk checks failed in this automated audit.`
      : score >= 30
        ? `The "${agentName}" configuration passes basic checks but has moderate security gaps that should be fixed before production.`
        : `The "${agentName}" configuration passed this automated audit with no critical rule violations detected.`;

  if (!recommendations.length) {
    recommendations.push("Re-run this audit after any gateway, tool, or session configuration change.");
  }

  return {
    config,
    riskScore: score,
    riskLevel,
    verdict,
    keyFindings: findings,
    recommendations: recommendations.slice(0, 4),
    confidence: "High — deterministic rule-based analysis of submitted JSON structure (not LLM inference)",
  };
}
