# SolGuard AI — Developer Context & Architecture Guide

Welcome to the **SolGuard AI** codebase! This document provides a complete technical guide for developers (and AI assistants like Claude) who have zero initial context but need to build, test, extend, or deploy this project.

---

## 1. Overview & Core Features
SolGuard AI is a real-time smart contract scanning, multi-agent AI threat intelligence, and transaction risk auditing platform for Solana SPL tokens.

### Key Capabilities
* **Multi-Agent Security Marketplace**: A suite of specialized agents (Token Audit, Contract Security, Bundle Detection, Holder Distribution, Liquidity depth/locks, Website scan, AI Consultant Q&A) configured as modular validators and executors.
* **On-Chain Heuristics Scanner**: Direct queries to Solana mainnet via Helius RPC decoding mint account details (mint/freeze authority state) and computing transaction density in recent slots to flag launch-snipe bundles.
* **Cryptographic Authentication**: Zero-password, wallet-based authentication. Users sign a server-generated nonce on-chain. The backend verifies the signature using `tweetnacl` and `bs58`, issuing a JWT token.
* **Solana USDC Payments**: Seamless on-chain pay-per-run payments. The backend polls the Helius RPC to locate the payment signature, verifies the balance change on the destination ATA, and dedupes the transaction in MongoDB.
* **Static SDK Deliverables**: Exposes fully functional, client-side JavaScript (`/sdk/solguard.js`) and Python (`/sdk/solguard.py`) SDKs to let external developers programmatically call agents.
* **Live Exploit Feed**: Combines live DeFiLlama Hacks API fetching with highly curated historical fallbacks to show real-time blockchain vulnerabilities.

---

## 2. Directory & File Structure

```text
solguard/
├── app/                          # Next.js 15 App Router Frontend & API Router
│   ├── api/
│   │   ├── [[...path]]/          # Catch-all Express-like dynamic API Router
│   │   │   └── route.js          # Core backend route handler (Auth, Agents, Watchlist, SSE)
│   │   ├── cron/
│   │   │   └── watcher/          # Serverless cron scheduler endpoint
│   │   │       └── route.js      # Watcher trigger verifying CRON_SECRET & calling tick()
│   │   └── scorecard/
│   │       └── [jobId]/          # OpenGraph card generator
│   │           └── route.js      # Dynamically generates a beautiful risk scorecard PNG
│   ├── globals.css               # Styling base, custom neon glow, scanline animations
│   ├── layout.js                 # Global HTML wrapper
│   └── page.js                   # Main application React dashboard (includes Solana wallet & USDC payment flow)
├── lib/
│   └── solguard/                 # Core business and utility logic
│       ├── agents.js             # Marketplace registry defining validators, executors, prices, and features
│       ├── aiSummary.js          # OpenAI/OpenRouter client generating single-paragraph summaries with Gemini
│       ├── auth.js               # tweetnacl & bs58 wallet verification, JWT signing
│       ├── exploitFeed.js        # DeFiLlama client with local fallback merging
│       ├── exploits.js           # Curated list of historical Solana exploits
│       ├── initDb.js             # Database seeder setting up MongoDB indexes at startup
│       ├── mongo.js              # Cached MongoDB client connection manager with hot-reloading URI recovery
│       ├── payment.js            # Solana transaction decoder checking USDC balance deltas on dest ATA
│       ├── rateLimit.js          # In-process token bucket rate limiter (IP, User, and Agent level)
│       ├── sanitize.js           # SSRF protection, host/IP validation, and string stripping
│       ├── scanEngine.js         # Solana RPC parser for mint authority checks & slot clustering
│       └── watcher.js            # Watchlist scanner running tick loops or Verel cron syncs
├── public/
│   └── sdk/                      # Public SDK static files
│       ├── solguard.js           # JavaScript/Node.js browser SDK
│       └── solguard.py           # Python 3 SDK (using requests)
├── vercel.json                   # Vercel cron interval definitions (every 3 minutes)
├── package.json                  # Script targets & dependency manifest
├── tailwind.config.js            # Design system themes & utility classes
├── scripts/                      # Node QA scripts (rate limits, payments, services, holder regression)
└── .env                          # Local environment secrets configuration
```

---

## 3. Core Architecture & Data Flows

### A. Nonce-Based Cryptographic Wallet Authentication
Authentication does not use passwords or email addresses. It verifies ownership of a Solana Public Key:
```mermaid
sequenceDiagram
    participant User as Frontend Client
    participant API as API Handler (route.js)
    participant DB as MongoDB Atlas

    User->>API: POST /api/auth/nonce { walletAddress }
    Note over API: Generate random cryptographically secure hex nonce
    API->>DB: Upsert nonce doc with 5-minute TTL index
    API-->>User: Return nonce & signable message string
    User->>User: Request wallet provider signature (e.g. Phantom)
    User->>API: POST /api/auth/verify { walletAddress, signature, nonce }
    Note over API: Verify signature using nacl.sign.detached.verify()
    API->>DB: Find and delete nonce doc (single-use)
    API->>DB: Get/create user document (grant 2 free credits if new)
    Note over API: Sign payload with JWT_SECRET (7-day expiry)
    API-->>User: Return JWT token & user information
```

---

### B. Token Risk Scanning & Score Heuristics
When a token is scanned (via `/api/watchlist` or `/api/agents/token-audit/run`):
```mermaid
sequenceDiagram
    participant API as API Handler
    participant SE as Scan Engine (scanEngine.js)
    participant Solana as Solana Mainnet RPC (Helius)
    participant Dex as DexScreener API

    API->>SE: runTokenScan(mintAddress)
    par Fetch Asset Metadata
        SE->>Solana: getAsset (JSON-RPC)
    and Check Authorities
        SE->>Solana: getParsedAccountInfo (SPL Mint account)
        Note over SE: Check for active Mint & Freeze authorities
    and Analyze Distribution & Bundles
        SE->>Solana: getTokenSupply (Total UI supply)
        SE->>Solana: getTokenLargestAccounts (Top holder concentration)
        SE->>Solana: getSignaturesForAddress (Last 200 tx signatures)
        Note over SE: Group txs by slot.<br/>Count slots containing >= 5 txs (clustered launch snipes)
    and Verify Liquidity Pool
        SE->>Dex: Fetch /latest/dex/tokens/{mintAddress}
        Note over SE: Pick most liquid pair.<br/>Extract USD liquidity pool depth
    end
    SE->>SE: Calculate riskScore (0-100) & riskLevel (LOW / MEDIUM / HIGH / CRITICAL)
    SE-->>API: Return unified scan report JSON
```

#### Risk Score Calculation Rules:
* Active Freeze Authority: `+30` (Critical danger: developer can freeze wallet tokens)
* Active Mint Authority: `+20` (Danger: developer can print infinite supply)
* Coordinated Bundle Launch (Slot Clustering): `+25`
* Top holder concentration > 20%: `+10`
* Top holder concentration > 50%: `+15`
* Top 10 holder concentration > 70%: `+10`
* Dex pool liquidity < $10,000 USD: `+15`
* Maximum possible score is capped at `100`.

---

### C. On-Chain Payment Verification Flow
Running an agent (such as `token-audit` which costs `0.10 USDC`) requires paid authorization. The platform bypasses traditional payment gateways by checking Solana ledger states:
1. **Frontend Transaction Creation**:
   * The client connects their wallet and creates a Solana `Transaction` transferring `0.10 USDC` (decimals = 6, amount = `100000`) from the user's Associated Token Account (ATA) to the project's destination wallet address (`USDC_DEST_WALLET`).
   * The user signs and submits the transaction to the Solana blockchain, receiving a **signature** hash.
2. **Backend Validation**:
   * The frontend submits the transaction signature to `POST /api/agents/token-audit/run`.
   * The backend's payment verifier (`payment.js`) checks MongoDB to ensure the signature has not been processed before (preventing double-spend exploits).
   * It queries the Helius RPC using `getParsedTransaction`. It polls up to 6 times with short delays to account for transaction propagation latency.
   * It inspects the `preTokenBalances` and `postTokenBalances` of the destination address ATA (`USDC_DEST_WALLET`) for the target USDC mint (`USDC_MINT`).
   * If the delta (amount credited) equals or exceeds the requested agent price, payment is marked valid.
   * The payment signature is recorded in MongoDB, and the agent begins execution.

---

## 4. Environment Variables (`.env`)

Create a `.env` file in the project root. The following keys are required for full operations:

| Variable Name | Purpose | Example / Value |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | Connects to OpenRouter to query the AI LLM | `sk-or-v1-...` |
| `HELIUS_API_KEY` | Powers Solana on-chain RPC checks and token metadata fetches | Get one from Helius |
| `MONGO_URL` | MongoDB Atlas cluster connection string | `mongodb+srv://user:pass@cluster...` |
| `DB_NAME` | The database name inside your Mongo cluster | `solguard` |
| `JWT_SECRET` | Cryptographic secret to sign user tokens | A long random string |
| `USDC_MINT` | Address of the USDC token on Solana mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `USDC_DEST_WALLET` | Wallet address that receives the scan/subscription fees | Solana pubkey (e.g. `AnBTwJ...`) |
| `CORS_ORIGINS` | Limits allowed origins (useful for cross-domain SDK integrations) | `*` or specific domain |
| `CRON_SECRET` | Auth header token to secure the watcher trigger on Vercel | Long secure token string |
| `TESTING_MODE_FREE_RUNS` | **Dev/staging only.** When `true`, authenticated wallet users can run agents without payment (USDC/credits/subscription checks skipped). Rate limits still apply. **Must be `false` or unset in production.** | `false` (default) or `true` |

> **Production risk:** If `TESTING_MODE_FREE_RUNS=true` is set on Vercel (or any live deployment), every authenticated user gets unlimited free agent runs with no USDC, credits, or subscription required. The UI shows an amber **TESTING MODE — Free Runs Enabled** badge and server logs `[TESTING MODE] Free run granted…` for each run. Always verify this variable is **absent or `false`** in production environment settings before shipping.

---

## 5. Vercel Serverless & Watcher Configuration

Because Vercel is a **Serverless** hosting platform, traditional long-running daemon processes or inline timers (`setInterval`) will not function reliably. Serverless containers are spun down after requests complete, which freezes execution loops.

To solve this, SolGuard AI splits its background loops depending on the runtime environment:

1. **Watcher Detection**:
   * Inside `app/api/[[...path]]/route.js`, the server inspects `process.env.VERCEL`.
   * If `VERCEL` is active, it logs a notice and **skips** initializing the local `setInterval` watcher loop.
2. **Vercel Crons (`vercel.json`)**:
   * A `vercel.json` file is defined at the root of the project:
     ```json
     {
       "crons": [
         {
           "path": "/api/cron/watcher",
           "schedule": "*/3 * * * *"
         }
       ]
     }
     ```
   * Every 3 minutes, Vercel triggers a secure `GET` request to `/api/cron/watcher`.
3. **Cron Security**:
   * The endpoint `/api/cron/watcher/route.js` validates that the incoming request contains an `Authorization: Bearer ${process.env.CRON_SECRET}` header (automatically injected by Vercel's scheduler).
   * Once validated, it triggers `initializeDatabase()` and runs a single `tick()` of the watchlist scanner.
4. **Watcher Cycle Logic (`lib/solguard/watcher.js`)**:
   * A database tick reads all token addresses saved in the `watchlist` collection.
   * It deduplicates the list, runs a token risk scan for each, and compares the result to the previous level in `watch_state`.
   * If the risk level shifts (e.g. from `LOW` to `HIGH`), it emits an alert document in the `alerts` collection for every user watching that token.
   * Users connected to the dashboard receive these alerts instantly via the Server-Sent Events (SSE) stream endpoint `/api/alerts/stream`.

---

## 6. How to Develop & Test Locally

### Prerequisites
* Node.js (version 18+ recommended)
* MongoDB (Local instance or Atlas connection string)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Environment Variables
Copy and customize `.env` using your active MongoDB connection string, your OpenRouter API key, and your Helius RPC key.

### Step 3: Run the Development Server
```bash
npm run dev
```
The server will boot on `http://localhost:3000`.

### Step 4: Run the Regression Suite
With the server running on port 3000, run the Node QA scripts in another shell:
```bash
node scripts/qa-rate-limit.mjs
node scripts/qa-payment-dedupe.mjs
node scripts/qa-stats-check.mjs
node scripts/qa-holder-regression.mjs
node scripts/qa-new-services.mjs
```
These cover rate limiting, USDC payment dedupe, stats endpoints, holder-concentration RPC fixes, and marketplace service routes.

---

## 7. How to Add a New Agent

To add a new security scanner agent to the marketplace:

1. **Define a Validator & Executor**:
   Add your code to `lib/solguard/agents.js`.
   ```javascript
   // 1. Validator: checks and formats incoming user inputs
   function validateCustomInput(inputs) {
     const value = inputs?.customField?.trim();
     if (!value) return { error: "Field is required" };
     return { customField: value };
   }

   // 2. Executor: performs checks, queries RPCs or APIs, and returns evidence
   async function execCustomScanner({ customField }) {
     // Perform analysis here...
     return {
       summary: "Everything looks clean.",
       riskScore: 0,
       riskLevel: "LOW",
       evidence: { details: customField },
       recommendations: []
     };
   }
   ```
2. **Register in the Marketplace**:
   Append the configuration object to the `AGENTS` array in `lib/solguard/agents.js`:
   ```javascript
   export const AGENTS = [
     // ...existing agents
     {
       id: "custom-scanner",
       name: "Custom Scanner",
       category: "Token",
       icon: "Shield", // Lucide icon name
       color: "teal",
       price: 0.10, // Cost in USDC
       supportedChains: ["Solana"],
       estimatedTime: "~2s",
       description: "Short description displayed on cards.",
       longDescription: "Detailed breakdown shown inside the agent detail view.",
       features: ["Feature 1 detail", "Feature 2 detail"],
       inputs: [{ key: "customField", label: "Custom Input", placeholder: "e.g. value" }],
       validator: "customInputValidatorKey", // mapped in VALIDATORS map
       executor: execCustomScanner,
     }
   ];
   ```
3. **Map the Validator**:
   Add the validator to the `VALIDATORS` registry object at the bottom of `lib/solguard/agents.js`:
   ```javascript
   const VALIDATORS = {
     // ...existing
     customInputValidatorKey: validateCustomInput,
   };
   ```
4. **Update the Icon Map**:
   If the agent uses a new Lucide React icon, ensure it is imported and registered in the `ICONS` map inside `app/page.js` (line 16) so it renders correctly on the frontend dashboard.
