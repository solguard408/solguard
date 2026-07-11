import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, "../../..");

const dest = path.resolve(__dirname, "../lib/solguard");



const FILES = [

  "lib/solguard/reportBuilder.js",

  "lib/solguard/verdictValidation.js",

  "lib/solguard/aiSummary.js",

  "lib/solguard/scanEngine.js",

  "lib/solguard/openclawAudit.js",

  "lib/solguard/exploits.js",

  "lib/solguard/llm/providers.js",

  "lib/solguard/llm/client.js",

  "lib/solguard/llm/prompts/consultant.js",

  "lib/solguard/agents/consultant.js",

  "lib/solguard/agents/localRun.js",

];



for (const rel of FILES) {

  const src = path.join(root, rel);

  const out = path.join(dest, rel.replace("lib/solguard/", ""));

  fs.mkdirSync(path.dirname(out), { recursive: true });

  fs.copyFileSync(src, out);

  console.log("bundled", rel);

}



console.log("CLI lib bundle complete.");


