import OpenAI from "openai";
import { getProvider } from "./providers.js";

/**
 * Create an injectable LLM client for server (OpenRouter) or CLI BYOK.
 * @param {{ provider: string, apiKey: string, model?: string }} opts
 * @returns {{ provider: string, model: string, complete: Function }}
 */
export function createLlmClient({ provider: providerId, apiKey, model }) {
  if (!apiKey) throw new Error("API key is required");
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  const resolvedModel = model || provider.defaultModel;

  if (provider.type === "anthropic") {
    return {
      provider: providerId,
      model: resolvedModel,
      complete: (messages, { maxTokens = 600, temperature = 0.6 } = {}) =>
        anthropicComplete({ apiKey, model: resolvedModel, messages, maxTokens, temperature }),
    };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider.baseURL,
    defaultHeaders: provider.defaultHeaders,
  });

  return {
    provider: providerId,
    model: resolvedModel,
    complete: async (messages, { maxTokens = 600, temperature = 0.6 } = {}) => {
      const completion = await client.chat.completions.create({
        model: resolvedModel,
        max_tokens: maxTokens,
        temperature,
        messages,
      });
      return completion.choices?.[0]?.message?.content?.trim() || "";
    },
  };
}

/** Server-side OpenRouter client using env key. */
export function createServerOpenRouterClient() {
  return createLlmClient({
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || undefined,
  });
}

async function anthropicComplete({ apiKey, model, messages, maxTokens, temperature }) {
  const system = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const block = data.content?.find((c) => c.type === "text");
  return block?.text?.trim() || "";
}
