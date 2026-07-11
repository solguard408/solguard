/** Provider registry — official API endpoints only (BYOK calls user's machine → provider). */
export const PROVIDERS = {
  openai: {
    id: "openai",
    label: "OpenAI",
    type: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    type: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    type: "openai",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    type: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: process.env.OPENROUTER_MODEL || "openrouter/free",
    defaultHeaders: {
      "HTTP-Referer": "https://www.solguard.space",
      "X-Title": "SolGuard AI",
    },
  },
};

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

export function listByokProviders() {
  return [PROVIDERS.openai, PROVIDERS.anthropic, PROVIDERS.gemini];
}
