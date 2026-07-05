// Shared agent input validation — used by API routes and Try-it forms.
import { isValidSolanaAddress } from "./scanEngine";
import { sanitizeUrl, sanitizeQuery, sanitizeString, sanitizeAgentInputsLegacy, FIELD_LIMITS } from "./sanitize";

/** Resolve validation type from explicit schema `type` or field key defaults. */
export function resolveInputType(def) {
  if (def.key === "query") return "text";
  if (def.key === "cpdv_data" || def.key === "cqcv_data") return "text";
  if (def.type) return def.type;
  if (def.key === "url") return "url";
  if (def.key === "tokenAddress" || def.key === "walletAddress") return "solanaAddress";
  if (def.key === "config") return "json";
  if (def.multiline) return "textarea";
  return "text";
}

function requiredMessage(label) {
  return `${label} is required`;
}

function urlMessage(label) {
  return `${label} must start with http:// or https://`;
}

/**
 * Validate + sanitize inputs against an agent's declared input schema.
 * Only fields listed in `schema` are processed — stray keys (e.g. leftover `url`) are ignored.
 */
export function validateAgentFormInputs(schema, rawInputs, { requireAll = true } = {}) {
  if (!schema?.length) return { error: "No input schema defined" };
  const cleaned = {};

  for (const def of schema) {
    const label = def.label || def.key;
    const raw = rawInputs?.[def.key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    const type = resolveInputType(def);

    if (!trimmed) {
      if (requireAll) return { error: requiredMessage(label) };
      continue;
    }

    switch (type) {
      case "url": {
        const r = sanitizeUrl(raw);
        if (r.error) return { error: urlMessage(label) };
        cleaned[def.key] = r.url;
        break;
      }
      case "solanaAddress": {
        if (!isValidSolanaAddress(trimmed)) {
          return { error: `Enter a valid Solana address for ${label}` };
        }
        cleaned[def.key] = trimmed;
        break;
      }
      case "json": {
        const max = FIELD_LIMITS[def.key] || FIELD_LIMITS.config;
        const v = sanitizeString(raw, max);
        if (!v || v.length < 2) return { error: `${label} must be at least 2 characters` };
        cleaned[def.key] = v;
        break;
      }
      case "textarea":
      case "text":
      default: {
        if (def.key === "query") {
          const q = sanitizeQuery(raw);
          if (q.length < 5) return { error: `${label} must be at least 5 characters` };
          cleaned[def.key] = q;
        } else {
          const max = FIELD_LIMITS[def.key] || FIELD_LIMITS.default;
          const v = sanitizeString(raw, max);
          if (!v) return { error: requiredMessage(label) };
          cleaned[def.key] = v;
        }
        break;
      }
    }
  }

  return { inputs: cleaned };
}

/** True when all required schema fields pass validation (for enabling Pay & Run). */
export function isAgentFormValid(schema, rawInputs) {
  return !validateAgentFormInputs(schema, rawInputs).error;
}

/** Schema-aware sanitization for API routes. */
export function sanitizeAgentInputs(inputs, schema = null) {
  if (schema?.length) return validateAgentFormInputs(schema, inputs);
  return sanitizeAgentInputsLegacy(inputs);
}
