import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { runTokenScan, isValidSolanaAddress } from "@/lib/solguard/scanEngine";
import { generateRiskSummary } from "@/lib/solguard/aiSummary";
import { getDb } from "@/lib/solguard/mongo";
import { signToken, verifySolanaSignature, getAuthUser } from "@/lib/solguard/auth";
import { startWatcher } from "@/lib/solguard/watcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kick off background watcher (no-op if already started)
startWatcher();

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function authMessage(nonce) {
  return `Sign this message to authenticate with SolGuard AI.\n\nNonce: ${nonce}`;
}

async function requireAuth(request) {
  const a = await getAuthUser(request);
  if (!a) return null;
  return a;
}

async function handleRoute(request, pathSegments) {
  const method = request.method;
  const path = "/" + (pathSegments || []).join("/");
  const db = await getDb();

  // ---------- HEALTH ----------
  if (method === "GET" && path === "/health") {
    return json({ status: "ok", service: "solguard", timestamp: new Date().toISOString() });
  }

  // ---------- AUTH ----------
  if (method === "POST" && path === "/auth/nonce") {
    const body = await request.json().catch(() => ({}));
    const walletAddress = body?.walletAddress?.trim();
    if (!isValidSolanaAddress(walletAddress)) return json({ error: "Invalid wallet address" }, 400);
    const nonce = crypto.randomBytes(16).toString("hex");
    await db.collection("nonces").updateOne(
      { walletAddress },
      { $set: { walletAddress, nonce, createdAt: new Date() } },
      { upsert: true }
    );
    return json({ nonce, message: authMessage(nonce) });
  }

  if (method === "POST" && path === "/auth/verify") {
    const body = await request.json().catch(() => ({}));
    const { walletAddress, signature, nonce } = body || {};
    if (!walletAddress || !signature || !nonce) return json({ error: "Missing fields" }, 400);
    const stored = await db.collection("nonces").findOne({ walletAddress });
    if (!stored || stored.nonce !== nonce) return json({ error: "Invalid or expired nonce" }, 401);
    const ok = verifySolanaSignature(walletAddress, authMessage(nonce), signature);
    if (!ok) return json({ error: "Signature verification failed" }, 401);
    await db.collection("nonces").deleteOne({ walletAddress });

    let user = await db.collection("users").findOne({ walletAddress });
    if (!user) {
      user = {
        id: uuidv4(),
        walletAddress,
        credits: 10,
        plan: "FREE",
        createdAt: new Date(),
      };
      await db.collection("users").insertOne(user);
    }
    const token = signToken({ userId: user.id, walletAddress });
    return json({ token, user: { id: user.id, walletAddress: user.walletAddress, credits: user.credits, plan: user.plan } });
  }

  if (method === "GET" && path === "/me") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const u = a.user;
    return json({ id: u.id, walletAddress: u.walletAddress, credits: u.credits, plan: u.plan });
  }

  // ---------- API KEYS ----------
  if (method === "GET" && path === "/keys") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const keys = await db.collection("apikeys")
      .find({ userId: a.user.id }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    // mask
    const masked = keys.map((k) => ({ ...k, key: k.key.slice(0, 12) + "\u2026" + k.key.slice(-4) }));
    return json({ keys: masked });
  }

  if (method === "POST" && path === "/keys") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const label = (body?.label || "Default").slice(0, 60);
    const key = "sg_live_" + crypto.randomBytes(20).toString("hex");
    const doc = {
      id: uuidv4(),
      key,
      label,
      userId: a.user.id,
      isActive: true,
      usageCount: 0,
      createdAt: new Date(),
      lastUsedAt: null,
    };
    await db.collection("apikeys").insertOne(doc);
    return json({ key, label, id: doc.id }); // full key shown once
  }

  if (method === "DELETE" && path.startsWith("/keys/")) {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const id = path.replace("/keys/", "");
    await db.collection("apikeys").updateOne({ id, userId: a.user.id }, { $set: { isActive: false } });
    return json({ ok: true });
  }

  // ---------- SCAN ----------
  if (method === "POST" && path === "/scan") {
    const body = await request.json().catch(() => ({}));
    const tokenAddress = body?.tokenAddress?.trim();
    if (!isValidSolanaAddress(tokenAddress)) return json({ error: "Invalid Solana token address format." }, 400);

    const a = await getAuthUser(request);
    let userId = null;
    if (a) {
      if ((a.user.credits || 0) <= 0) {
        return json({ error: "Out of credits. Add an API key or top up.", upgradeUrl: "/dashboard/billing" }, 402);
      }
      userId = a.user.id;
    }

    const jobId = uuidv4();
    await db.collection("scans").insertOne({
      id: jobId, tokenAddress, userId, status: "PROCESSING", createdAt: new Date(),
    });

    try {
      const result = await runTokenScan(tokenAddress);
      const aiSummary = await generateRiskSummary(result);
      await db.collection("scans").updateOne(
        { id: jobId },
        { $set: { status: "COMPLETED", result, aiSummary, riskScore: result.riskScore, riskLevel: result.riskLevel, completedAt: new Date() } }
      );
      if (userId) await db.collection("users").updateOne({ id: userId }, { $inc: { credits: -1 } });
      const remaining = userId ? (a.user.credits - 1) : null;
      return json({ jobId, status: "COMPLETED", result, aiSummary, remainingCredits: remaining });
    } catch (e) {
      const msg = e?.message || "Scan failed";
      await db.collection("scans").updateOne({ id: jobId }, { $set: { status: "FAILED", errorMessage: msg, completedAt: new Date() } });
      return json({ jobId, status: "FAILED", error: msg }, 200);
    }
  }

  if (method === "GET" && path.startsWith("/scan/")) {
    const jobId = path.replace("/scan/", "");
    const doc = await db.collection("scans").findOne({ id: jobId }, { projection: { _id: 0 } });
    if (!doc) return json({ error: "Scan not found" }, 404);
    return json(doc);
  }

  if (method === "GET" && path === "/scans") {
    const docs = await db.collection("scans")
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    return json({ scans: docs, total: docs.length });
  }

  if (method === "GET" && path === "/stats") {
    const total = await db.collection("scans").countDocuments({});
    const threats = await db.collection("scans").countDocuments({ riskLevel: { $in: ["HIGH", "CRITICAL"] } });
    return json({ total, threats, latency: Math.floor(8 + Math.random() * 18) });
  }

  // ---------- WATCHLIST ----------
  if (method === "GET" && path === "/watchlist") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const items = await db.collection("watchlist")
      .find({ userId: a.user.id }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    // merge with watch_state for current level
    const tokens = items.map((i) => i.tokenAddress);
    const states = await db.collection("watch_state").find({ tokenAddress: { $in: tokens } }, { projection: { _id: 0 } }).toArray();
    const stateMap = Object.fromEntries(states.map((s) => [s.tokenAddress, s]));
    return json({ items: items.map((i) => ({ ...i, state: stateMap[i.tokenAddress] || null })) });
  }

  if (method === "POST" && path === "/watchlist") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    const tokenAddress = body?.tokenAddress?.trim();
    if (!isValidSolanaAddress(tokenAddress)) return json({ error: "Invalid address" }, 400);
    await db.collection("watchlist").updateOne(
      { userId: a.user.id, tokenAddress },
      { $set: { userId: a.user.id, tokenAddress, createdAt: new Date() } },
      { upsert: true }
    );
    // Prime state so first scan-level change can be detected
    const existing = await db.collection("watch_state").findOne({ tokenAddress });
    if (!existing) {
      try {
        const scan = await runTokenScan(tokenAddress);
        await db.collection("watch_state").updateOne(
          { tokenAddress },
          { $set: { tokenAddress, riskLevel: scan.riskLevel, riskScore: scan.riskScore, metadata: scan.metadata, updatedAt: new Date() } },
          { upsert: true }
        );
      } catch {}
    }
    return json({ ok: true });
  }

  if (method === "DELETE" && path.startsWith("/watchlist/")) {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const tokenAddress = decodeURIComponent(path.replace("/watchlist/", ""));
    await db.collection("watchlist").deleteOne({ userId: a.user.id, tokenAddress });
    return json({ ok: true });
  }

  // ---------- ALERTS (polling fallback) ----------
  if (method === "GET" && path === "/alerts") {
    const a = await requireAuth(request);
    if (!a) return json({ error: "Unauthorized" }, 401);
    const since = parseInt(request.headers.get("x-since") || "0", 10);
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alerts = await db.collection("alerts")
      .find({ userId: a.user.id, createdAt: { $gt: sinceDate } }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return json({ alerts });
  }

  // ---------- SSE ALERTS STREAM ----------
  if (method === "GET" && path === "/alerts/stream") {
    // Auth via query token (EventSource cannot set headers)
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
            const newAlerts = await db.collection("alerts")
              .find({ userId, createdAt: { $gt: lastCheck } }, { projection: { _id: 0 } })
              .sort({ createdAt: 1 })
              .toArray();
            if (newAlerts.length) {
              lastCheck = newAlerts[newAlerts.length - 1].createdAt;
              for (const a of newAlerts) send({ type: "alert", alert: a });
            } else {
              send({ type: "ping", ts: Date.now() });
            }
          } catch {}
        };
        intervalId = setInterval(tick, 5000);
      },
      cancel() { if (intervalId) clearInterval(intervalId); },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  return json({ error: "Not found", path }, 404);
}

export async function GET(request, { params }) {
  const p = await params; return handleRoute(request, p?.path || []);
}
export async function POST(request, { params }) {
  const p = await params; return handleRoute(request, p?.path || []);
}
export async function DELETE(request, { params }) {
  const p = await params; return handleRoute(request, p?.path || []);
}
