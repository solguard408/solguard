# solguard-cli

Run SolGuard security agents from your terminal.

## Install / run

```bash
npx solguard-cli
```

No global install required. Works with `npm install -g solguard-cli` as well.

Requires **Node.js 18+**.

## Modes

| Mode | Description |
|------|-------------|
| **Local (recommended)** | Runs on your machine. No SolGuard free credits. Bring your own OpenAI / Anthropic / Gemini key for AI agents. |
| **Free** | Optional — uses SolGuard API + signup credits (same as website). |

Local mode does **not** call the SolGuard backend for execution. Keys stay on your machine (`~/.solguard/config.json`).

## Services (local)

- Cyber Security Consultant (BYOK LLM)
- Solana Token Verification (BYOK LLM + Helius for on-chain)
- Smart Contract Security Audit (Helius)
- Wallet Verification (Helius)
- Web3 dApp Frontend Verification
- OpenClaw AI Agent Verification

## Config

`~/.solguard/config.json` (mode `600` on Unix):

```json
{
  "cliInstallId": "<uuid>",
  "token": "<jwt>",
  "baseUrl": "https://www.solguard.space/api",
  "savedKeys": {}
}
```

## Local tips

- **BYOK LLM:** Cyber Security Consultant, Solana Token Verification
- **On-chain agents:** set `HELIUS_API_KEY` in your environment
- Free mode only: needs network access to `https://www.solguard.space/api`

## Local development

```powershell
$env:SOLGUARD_API = "http://localhost:3000/api"
node bin/solguard-cli.js
```

Local **premium** mode works without the API. Free mode needs `npm run dev`.

## Publish (maintainers)

```bash
npm login
cd packages/solguard-cli
npm publish --access public
```

Bump `version` in `package.json` before republishing.

## QA

```bash
node scripts/qa-cli-local-premium.mjs
```
