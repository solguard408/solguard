import { createLlmClient } from "../lib/solguard/llm/client.js";

import { listByokProviders } from "../lib/solguard/llm/providers.js";

import {

  runAgentLocal,

  canRunLocalPremium,

  agentUsesByokLlm,

  localPremiumRequiresHelius,

} from "../lib/solguard/agents/localRun.js";



export { listByokProviders, canRunLocalPremium, agentUsesByokLlm, localPremiumRequiresHelius };



const PROVIDER_DATA_SOURCE = {

  openai: ["OpenAI (local BYOK)"],

  anthropic: ["Anthropic Claude (local BYOK)"],

  gemini: ["Google Gemini (local BYOK)"],

};



/** @deprecated use runAgentLocalPremium */

export async function runConsultantLocal(query, { provider, apiKey }) {

  return runAgentLocalPremium("ai-consultant", { query }, { provider, apiKey });

}



/**

 * Run an agent locally — no SolGuard backend calls.

 * BYOK LLM key required for ai-consultant and solana-token-verification (AI verdict).

 */

export async function runAgentLocalPremium(agentId, inputs, { provider, apiKey } = {}) {

  if (!canRunLocalPremium(agentId)) {

    throw new Error(`Agent "${agentId}" does not support premium local mode`);

  }



  let llmClient = null;

  let dataSource = ["Local execution (CLI)"];



  if (agentUsesByokLlm(agentId)) {

    if (!apiKey) throw new Error("API key is required for this agent in premium local mode");

    llmClient = createLlmClient({ provider, apiKey });

    dataSource = PROVIDER_DATA_SOURCE[provider] || ["Local BYOK"];

  }



  return runAgentLocal(agentId, inputs, { llmClient, dataSource });

}


