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
| **Free** | Uses SolGuard API + your 2 signup credits (same as website). Identity: anonymous `cliInstallId` in `~/.solguard/config.json`. |
| **Premium (Beta)** | Bring your own OpenAI, Anthropic, or Gemini key — runs **locally** on your machine. Key never sent to SolGuard. Six services supported. |

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

## Premium local (Beta)

- **BYOK LLM required:** Cyber Security Consultant, Solana Token Verification
- **Local only (no API key):** Wallet Verification, dApp Frontend Scan, OpenClaw Audit, Smart Contract Audit
- **On-chain agents:** set `HELIUS_API_KEY` in your environment

## Local development

1. Start the API: `npm run dev` (from repo root)
2. Run the CLI — it auto-detects `http://localhost:3000/api` when the dev server is up

Or set explicitly:

```powershell
$env:SOLGUARD_API = "http://localhost:3000/api"
node bin/solguard-cli.js
```

## Publish (maintainers)

```bash
npm login
cd packages/solguard-cli
npm publish --access public
```

**Do not publish without explicit approval.**

## QA

```bash
node scripts/qa-cli-auth.mjs http://localhost:3000/api
node scripts/qa-cli-local-premium.mjs
```
