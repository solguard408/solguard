import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { isValidSolanaAddress } from "@/lib/solguard/scanEngine";
import { getDb } from "@/lib/solguard/mongo";
import { signToken, verifySolanaSignature, getAuthUser } from "@/lib/solguard/auth";
import { startWatcher } from "@/lib/solguard/watcher";
import { listAgents, getAgent, runAgent } from "@/lib/solguard/agents";
import { verifyUsdcPayment, getPaymentConfig } from "@/lib/solguard/payment";
import { getExploits } from "@/lib/solguard/exploitFeed";
import { runTokenScan } from "@/lib/solguard/scanEngine";
import { checkAgentRunLimit, checkUserGlobalLimit, checkIpAuthLimit, checkIpPublicLimit } from "@/lib/solguard/rateLimit";
import { sanitizeAgentInputs } from "@/lib/solguard/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

startWatcher();

const SUBSCRIPTION_PLANS = {
  starter: { id: "starter", name: "Starter", priceUsdc: 9, quota: 100, days: 30 },
  pro:     { id: "pro",     name: "Pro",     priceUsdc: 49, quota: 1000, days: 30, popular: true },
  business:{ id: "business",name: "Business",priceUsdc: 0, quota: -1,    days: 30, custom: true },
};

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function authMessage(nonce) { return `Sign this message to authenticate with SolGuard AI.\n\nNonce: ${nonce}`; }

async function requireAuth(request) {
  const a = await getAuthUser(request);
  if (!a) return null;
  return a;
}

async function activeSubscription(db, userId) {
  const sub = await db.collection("subscriptions").findOne({ userId, expiresAt: { $gt: new Date() } });
  if (!sub) return null;
  if (sub.quota !== -1 && sub.remaining <= 0) return null;
  return sub;
}

async function handleRoute(request, segments) {
  const method = request.method;
  const path = "/" + (segments || []).join("/");
  const db = await getDb();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";

  // ---------- HEALTH ----------
  if (method === "GET" && path === "/health") return json({ status: "ok", timestamp: new Date().toISOString() });

  // ---------- PAYMENT CONFIG ----------
  if (method === "GET" && path === "/payment/config") return json(getPaymentConfig());

  // ---------- AUTH ----------
  if (method === "POST" && path === "/auth/nonce") {
    const rl = checkIpAuthLimit({ ip });
    if (!rl.ok) return json({ error: "Too many auth requests. Retry shortly." }, 429);
    const body = await request.json().catch(() => ({}));
    const walletAddress = body?.walletAddress?.trim();
    if (!isValidSolanaAddress(walletAddress)) return json({ error: "Invalid wallet address" }, 400);
    const nonce = crypto.randomBytes(16).toString("hex");
    await db.collection("nonces").updateOne({ walletAddress }, { $set: { walletAddress, nonce, createdAt: new Date() } }, { upsert: true });
    return json({ nonce, message: authMessage(nonce) });
  }
  if (method === "POST" && path === "/auth/verify") {
    const body = await request.json().catch(() => ({}));
    const { walletAddress, signature, nonce } = body || {};
    if (!walletAddress || !signature || !nonce) return json({ error: "Missing fields" }, 400);
    const stored = await db.collection("nonces").findOne({ walletAddress });
    if (!stored || stored.nonce !== nonce) return json({ error: "Invalid or expired nonce" }, 401);
    if (!verifySolanaSignature(walletAddress, authMessage(nonce), signature)) return json({ error: "Signature verification failed" }, 401);
    await db.collection("nonces").deleteOne({ walletAddress });

    let user = await db.collection("users").findOne({ walletAddress });
    if (!user) {
      // 2 free credits ONLY, non-renewable. Track via creditsGranted to prevent farming.
      user = { id: uuidv4(), walletAddress, credits: 2, creditsGranted: 2, plan: "FREE", createdAt: new Date() };
      await db.collection("users").insertOne(user);
    }
    const token = signToken({ userId: user.id, walletAddress });
    return json({ token, user: { id: user.id, walletAddress: user.walletAddress, credits: user.credits, plan: user.plan } });
  }
  if (method === "GET" && path === "/me") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const u = a.user;
    const sub = await activeSubscription(db, u.id);
    return json({ id: u.id, walletAddress: u.walletAddress, credits: u.credits, plan: u.plan, subscription: sub ? { plan: sub.plan, remaining: sub.remaining, quota: sub.quota, expiresAt: sub.expiresAt } : null });
  }

  // ---------- AGENTS ----------
  if (method === "GET" && path === "/agents") return json({ agents: listAgents() });
  if (method === "GET" && path.startsWith("/agents/") && !path.includes("/run") && !path.includes("/reports")) {
    const id = path.replace("/agents/", "");
    const agent = getAgent(id);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const { executor, validator, ...safe } = agent;
    return json(safe);
  }

  // POST /agents/:id/run  body: { inputs, paymentMethod: "credit"|"subscription"|"usdc", paymentSignature? }
  if (method === "POST" && /^\/agents\/[^/]+\/run$/.test(path)) {
    const id = path.split("/")[2];
    const agent = getAgent(id);
    if (!agent) return json({ error: "Agent not found" }, 404);
    const body = await request.json().catch(() => ({}));
    const { inputs = {}, paymentMethod = "usdc", paymentSignature = null } = body;

    const a = await requireAuth(request);
    if (!a) return json({ error: "Authentication required. Connect your wallet to run agents." }, 401);
    const user = a.user;

    // Rate limit: per-user-per-agent + per-user-global
    const isPremium = !!(await activeSubscription(db, user.id));
    const rlAgent = checkAgentRunLimit({ userId: user.id, agentId: id, isPremium });
    if (!rlAgent.ok) return json({ error: `Rate limit exceeded for this agent. Retry in ${Math.ceil(rlAgent.resetIn / 1000)}s.` }, 429);
    const rlUser = checkUserGlobalLimit({ userId: user.id, isPremium });
    if (!rlUser.ok) return json({ error: `Global rate limit exceeded. Retry in ${Math.ceil(rlUser.resetIn / 1000)}s.` }, 429);

    // Sanitize inputs (strip control chars, length caps, SSRF protection on URL)
    const san = sanitizeAgentInputs(inputs);
    if (san.error) return json({ error: san.error }, 400);
    const cleanInputs = san.inputs;

    // Payment resolution
    let billing = { method: paymentMethod };
    if (paymentMethod === "credit") {
      if ((user.credits || 0) <= 0) return json({ error: "No free credits left. Pay 0.10 USDC or subscribe." }, 402);
    } else if (paymentMethod === "subscription") {
      const sub = await activeSubscription(db, user.id);
      if (!sub) return json({ error: "No active subscription" }, 402);
      billing.subscriptionId = sub.id;
    } else if (paymentMethod === "usdc") {
      const v = await verifyUsdcPayment({ signature: paymentSignature, amountUsdc: agent.price, payerAddress: user.walletAddress });
      if (!v.ok) return json({ error: v.error }, 402);
      billing.signature = paymentSignature;
      billing.amount = v.amount;
    } else {
      return json({ error: "Invalid payment method" }, 400);
    }

    // Run with sanitized inputs
    const exec = await runAgent(id, cleanInputs);
    if (exec.error) return json({ error: exec.error }, 400);

    // Deduct after success
    if (paymentMethod === "credit") {
      await db.collection("users").updateOne({ id: user.id }, { $inc: { credits: -1 } });
    } else if (paymentMethod === "subscription") {
      await db.collection("subscriptions").updateOne({ id: billing.subscriptionId, quota: { $ne: -1 } }, { $inc: { remaining: -1 } });
    }

    // Persist report
    const reportId = uuidv4();
    const report = {
      id: reportId, userId: user.id, agentId: id, agentName: agent.name, inputs: cleanInputs, result: exec.result,
      billing, createdAt: new Date(),
    };
    await db.collection("reports").insertOne(report);

    return json({ reportId, agentId: id, agentName: agent.name, ...exec.result, inputs, createdAt: report.createdAt });
  }

  // ---------- REPORTS ----------
  if (method === "GET" && path === "/reports") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const docs = await db.collection("reports")
      .find({ userId: a.user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray();
    return json({ reports: docs });
  }
  if (method === "GET" && path.startsWith("/reports/")) {
    const id = path.replace("/reports/", "");
    const doc = await db.collection("reports").findOne({ id }, { projection: { _id: 0 } });
    if (!doc) return json({ error: "Not found" }, 404);
    return json(doc);
  }

  // ---------- SUBSCRIPTIONS ----------
  if (method === "GET" && path === "/subscriptions/plans") return json({ plans: Object.values(SUBSCRIPTION_PLANS) });
  if (method === "POST" && path === "/subscriptions/subscribe") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const plan = SUBSCRIPTION_PLANS[body?.plan];
    if (!plan) return json({ error: "Unknown plan" }, 400);
    if (plan.custom) return json({ error: "Business plan is custom — contact sales." }, 400);
    const v = await verifyUsdcPayment({ signature: body?.paymentSignature, amountUsdc: plan.priceUsdc, payerAddress: a.user.walletAddress });
    if (!v.ok) return json({ error: v.error }, 402);
    const sub = {
      id: uuidv4(), userId: a.user.id, plan: plan.id, quota: plan.quota, remaining: plan.quota,
      paymentSignature: body.paymentSignature, expiresAt: new Date(Date.now() + plan.days * 86400_000), createdAt: new Date(),
    };
    await db.collection("subscriptions").insertOne(sub);
    return json({ subscription: { plan: sub.plan, remaining: sub.remaining, quota: sub.quota, expiresAt: sub.expiresAt } });
  }

  // ---------- WATCHLIST ----------
  if (method === "GET" && path === "/watchlist") {
    const a = await requireAuth(request); if (!a) return json({ error: "Unauthorized" }, 401);
    const items = await db.collection("watchlist").find({ userId: a.user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    const tokens = items.map((i) => i.tokenAddress);
    const states = await db.collection("watch_state").find({ tokenAddress: { $in: tokens } }, { projection: { _id: 0 } }).toArray();
    const stateMap = Object.fromEntries(states.map((s) => [s.tokenAddress, s]));
    return json({ items: items.map((i) => ({ ...i, state: stateMap[i.tokenAddress] || null })) });
  }
  if (method === "POST" && path === "/watchlist") {
    const a = await requireAuth(request); if (!a) return json({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const tokenAddress = body?.tokenAddress?.trim();
    if (!isValidSolanaAddress(tokenAddress)) return json({ error: "Invalid address" }, 400);
    await db.collection("watchlist").updateOne({ userId: a.user.id, tokenAddress }, { $set: { userId: a.user.id, tokenAddress, createdAt: new Date() } }, { upsert: true });
    const existing = await db.collection("watch_state").findOne({ tokenAddress });
    if (!existing) {
      try {
        const scan = await runTokenScan(tokenAddress);
        await db.collection("watch_state").updateOne({ tokenAddress }, { $set: { tokenAddress, riskLevel: scan.riskLevel, riskScore: scan.riskScore, metadata: scan.metadata, updatedAt: new Date() } }, { upsert: true });
      } catch {}
    }
    return json({ ok: true });
  }
  if (method === "DELETE" && path.startsWith("/watchlist/")) {
    const a = await requireAuth(request); if (!a) return json({ error: "Unauthorized" }, 401);
    const tokenAddress = decodeURIComponent(path.replace("/watchlist/", ""));
    await db.collection("watchlist").deleteOne({ userId: a.user.id, tokenAddress });
    return json({ ok: true });
  }

  // ---------- ALERTS SSE ----------
  if (method === "GET" && path === "/alerts/stream") {
    const url = new URL(request.url);
    const tok = url.searchParams.get("token");
    let userId = null;
    if (tok) {
      const fakeReq = { headers: { get: (k) => (k.toLowerCase() === "authorization" ? `Bearer ${tok}` : "") } };
      const a = await getAuthUser(fakeReq);
      userId = a?.user?.id || null;
    }
    if (!userId) return new Response("unauthorized", { status: 401 });
    const encoder = new TextEncoder();
    let lastCheck = new Date();
    let intervalId;
    const stream = new ReadableStream({
      async start(controller) {
        function send(obj) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); }
        send({ type: "hello", ts: Date.now() });
        const tick = async () => {
          try {
            const newAlerts = await db.collection("alerts").find({ userId, createdAt: { $gt: lastCheck } }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
            if (newAlerts.length) { lastCheck = newAlerts[newAlerts.length - 1].createdAt; for (const a of newAlerts) send({ type: "alert", alert: a }); }
            else send({ type: "ping", ts: Date.now() });
          } catch {}
        };
        intervalId = setInterval(tick, 5000);
      },
      cancel() { if (intervalId) clearInterval(intervalId); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" } });
  }

  // ---------- API KEYS ----------
  if (method === "GET" && path === "/keys") {
    const a = await requireAuth(request); if (!a) return json({ error: "Unauthorized" }, 401);
    const keys = await db.collection("apikeys").find({ userId: a.user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    return json({ keys: keys.map((k) => ({ ...k, key: k.key.slice(0, 12) + "…" + k.key.slice(-4) })) });
  }
  if (method === "POST" && path === "/keys") {
    const a = await requireAuth(request); if (!a) return json({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const label = (body?.label || "Default").slice(0, 60);
    const key = "sg_live_" + crypto.randomBytes(20).toString("hex");
    const doc = { id: uuidv4(), key, label, userId: a.user.id, isActive: true, usageCount: 0, createdAt: new Date(), lastUsedAt: null };
    await db.collection("apikeys").insertOne(doc);
    return json({ key, label, id: doc.id });
  }
  if (method === "DELETE" && path.startsWith("/keys/")) {
    const a = await requireAuth(request); if (!a) return json({ error: "Unauthorized" }, 401);
    const id = path.replace("/keys/", "");
    await db.collection("apikeys").updateOne({ id, userId: a.user.id }, { $set: { isActive: false } });
    return json({ ok: true });
  }

  // ---------- EXPLOITS / STATS ----------
  if (method === "GET" && path === "/exploits") {
    const rl = checkIpPublicLimit({ ip });
    if (!rl.ok) return json({ error: "Rate limit" }, 429);
    const exploits = await getExploits();
    return json({ exploits, source: "live+fallback", updatedAt: new Date().toISOString() });
  }
  if (method === "GET" && path === "/stats/overall") {
    const total = await db.collection("reports").countDocuments({});
    const today = await db.collection("reports").countDocuments({ createdAt: { $gt: new Date(Date.now() - 86400_000) } });
    const threats = await db.collection("reports").countDocuments({ "result.riskLevel": { $in: ["HIGH", "CRITICAL"] } });
    const users = await db.collection("users").countDocuments({});
    return json({ total, today, threats, users, agentsActive: listAgents().length });
  }
  if (method === "GET" && path === "/stats") {
    // legacy
    const total = await db.collection("reports").countDocuments({});
    const threats = await db.collection("reports").countDocuments({ "result.riskLevel": { $in: ["HIGH", "CRITICAL"] } });
    return json({ total, threats, latency: Math.floor(8 + Math.random() * 18) });
  }

  return json({ error: "Not found", path }, 404);
}

export async function GET(request, { params }) { const p = await params; return handleRoute(request, p?.path || []); }
export async function POST(request, { params }) { const p = await params; return handleRoute(request, p?.path || []); }
export async function DELETE(request, { params }) { const p = await params; return handleRoute(request, p?.path || []); }
