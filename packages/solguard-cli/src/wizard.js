import * as p from "@clack/prompts";

import fs from "fs";

import { ensureConfig, updateConfig, saveConfig, resolveBaseUrl } from "./config.js";

import {

  ensureAuth,

  fetchConfig,

  fetchServices,

  fetchServiceDetail,

  fetchMe,

  runAgentFree,

} from "./api.js";

import { formatReport, printReport, reportFilename } from "./output.js";

import {

  listByokProviders,

  runAgentLocalPremium,

  canRunLocalPremium,

  agentUsesByokLlm,

  localPremiumRequiresHelius,

} from "./premium.js";



function isCancel(v) {

  if (p.isCancel(v)) {

    p.cancel("Cancelled.");

    process.exit(0);

  }

  return v;

}



async function promptInputs(fields) {

  const inputs = {};

  for (const field of fields) {

    const opts = {

      message: field.label || field.key,

      placeholder: field.placeholder || field.example || "",

    };

    if (field.type === "json") {

      opts.message += " (paste JSON)";

    }

    if (field.multiline || field.type === "text" || field.type === "json") {

      let val = isCancel(await p.text({ ...opts, defaultValue: "" }));

      while (!val?.trim()) {

        p.log.warn("Please enter a value.");

        val = isCancel(await p.text({ ...opts, defaultValue: "" }));

      }

      inputs[field.key] = val.trim();

    } else {

      let val = isCancel(await p.text({ ...opts, defaultValue: "" }));

      while (!val?.trim()) {

        p.log.warn("Please enter a value.");

        val = isCancel(await p.text({ ...opts, defaultValue: "" }));

      }

      inputs[field.key] = val.trim();

    }

  }

  return inputs;

}



function showReport(report, opts) {

  p.log.step("Report");

  printReport(report, opts);

}



async function promptSaveReport(report) {

  const save = isCancel(

    await p.confirm({ message: "Save result to file?", initialValue: false })

  );

  if (!save) return;

  const name = reportFilename();

  fs.writeFileSync(name, JSON.stringify(report, null, 2), "utf8");

  p.log.success(`Saved to ${name}`);

}



async function promptByokCredentials(config) {

  const providers = listByokProviders();

  const providerId = isCancel(

    await p.select({

      message: "LLM provider",

      options: providers.map((pr) => ({ value: pr.id, label: pr.label })),

    })

  );



  let apiKey = config.savedKeys?.[providerId];

  if (apiKey) {

    const reuse = isCancel(

      await p.confirm({

        message: `Use saved ${providerId} key from ~/.solguard/config.json?`,

        initialValue: true,

      })

    );

    if (!reuse) apiKey = null;

  }



  if (!apiKey) {

    apiKey = isCancel(await p.password({ message: "API key (input hidden)" }));

    const saveKey = isCancel(

      await p.confirm({ message: "Save this key for future runs?", initialValue: false })

    );

    if (saveKey) {

      config.savedKeys = { ...config.savedKeys, [providerId]: apiKey };

      saveConfig(config);

      p.log.info("Key saved to ~/.solguard/config.json (mode 600)");

    }

  }



  return { providerId, apiKey };

}



function premiumModeLabel(agentId) {

  if (agentUsesByokLlm(agentId)) {

    return "Premium (Beta) — your own API key (runs locally, key never sent to SolGuard)";

  }

  return "Premium (Beta) — run locally (no SolGuard backend)";

}



export async function runWizard() {

  p.intro("SolGuard CLI · Beta");



  let config = ensureConfig();

  config.baseUrl = await resolveBaseUrl(config);

  updateConfig({ baseUrl: config.baseUrl });



  config = { ...config, ...(await ensureAuth(config)) };

  updateConfig({ token: config.token });



  if (config.baseUrl.includes("localhost")) {

    p.log.info(`Using local API: ${config.baseUrl}`);

  }



  const remoteConfig = await fetchConfig(config.baseUrl);

  const services = await fetchServices(config.baseUrl);



  if (!services.length) {

    p.log.error("No services returned from API.");

    process.exit(1);

  }



  const serviceId = isCancel(

    await p.select({

      message: "Select a service",

      options: services.map((s) => ({

        value: s.id,

        label: s.name,

        hint: s.category,

      })),

    })

  );



  const service = services.find((s) => s.id === serviceId);

  const detail = await fetchServiceDetail(config.baseUrl, serviceId);

  const agentId = service.primaryAgentId;

  const inputFields = detail?.agent?.inputs || [];

  const supportsLocalPremium = canRunLocalPremium(agentId);



  let mode = "free";

  if (supportsLocalPremium) {

    mode = isCancel(

      await p.select({

        message: "Run mode",

        options: [

          {

            value: "free",

            label: "Free — SolGuard credits (server-side execution)",

            hint: `${config.credits ?? "?"} credits remaining`,

          },

          {

            value: "premium",

            label: premiumModeLabel(agentId),

          },

        ],

      })

    );

  } else {

    p.log.info("Premium local mode is not available for this service (requires SolGuard backend). Using free credits.");

  }



  const inputs = await promptInputs(inputFields);

  const s = p.spinner();



  let report;



  if (mode === "premium" && supportsLocalPremium) {

    if (localPremiumRequiresHelius(agentId) && !process.env.HELIUS_API_KEY) {

      p.log.warn("HELIUS_API_KEY is not set — on-chain scans will fail. Export it before running.");

    }



    let providerId = null;

    let apiKey = null;

    if (agentUsesByokLlm(agentId)) {

      ({ providerId, apiKey } = await promptByokCredentials(config));

    }



    s.start(agentUsesByokLlm(agentId)

      ? "Running locally via your provider (no SolGuard backend call)…"

      : "Running locally (no SolGuard backend call)…");

    try {

      const result = await runAgentLocalPremium(agentId, inputs, { provider: providerId, apiKey });

      if (result?.error) {

        s.stop("Failed");

        p.log.error(result.error);

        process.exit(1);

      }

      report = { agentId, agentName: service.name, result };

      s.stop("Done");

      const modeLabel = providerId ? `Premium (${providerId}, local)` : "Premium (local)";

      showReport(report, { mode: modeLabel });

    } catch (e) {

      s.stop("Failed");

      throw e;

    }

  } else {

    const paymentMethod = remoteConfig.testingModeFreeRuns ? "testing" : "credit";

    if (paymentMethod === "credit" && (config.credits ?? 0) <= 0) {

      p.log.error("No free credits left. Try premium local mode or connect a wallet on solguard.space.");

      process.exit(1);

    }



    s.start("Running via SolGuard API…");

    try {

      report = await runAgentFree(config.baseUrl, config.token, agentId, inputs, paymentMethod);

      s.stop("Done");

      const me = await fetchMe(config.baseUrl, config.token);

      const creditsRemaining = me.credits;

      showReport(report, {

        mode: paymentMethod === "testing" ? "Free (testing mode)" : "Free (SolGuard credits)",

        creditsRemaining,

      });

      config.credits = creditsRemaining;

      updateConfig({ token: config.token, credits: creditsRemaining });

    } catch (e) {

      s.stop("Failed");

      if (e.status === 402) {

        p.log.error("Payment required — no credits left.");

        process.exit(1);

      }

      throw e;

    }

  }



  await promptSaveReport(report);

  p.outro("Done");

}


