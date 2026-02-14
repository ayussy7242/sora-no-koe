"use strict";

const express = require("express");
const Stripe = require("stripe");
const rawBody = require("../middleware/rawBody");
const { getPurchaseToken } = require("../engine/purchase_tokens");
const { enqueueBlueprintGenerate } = require("../engine/tasks_queue");
const { createLineApi } = require("../line/line_api");
const { LINE_COPY } = require("../copy");

function createStripeClient(env) {
  if (!env?.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-04-10",
  });
}

function pickUrl(env, key, fallback) {
  const v = env?.[key];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

function createStripeRouter(deps = {}) {
  const router = express.Router();

  const env = deps.env || {};
  const db = deps.db;
  const admin = deps.admin;

  if (!db) throw new Error("deps.db is required for stripe router");
  if (!admin) throw new Error("deps.admin is required for stripe router");

  // --------------------
  // checkout (LIGHT)
  // --------------------
  router.post("/checkout/light", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token) return res.status(400).json({ ok: false, error: "token is required" });

      const tokenDoc = await getPurchaseToken({ db, token });
      if (!tokenDoc?.exists) return res.status(404).json({ ok: false, error: "token not found" });
      if (tokenDoc.data?.used) return res.status(409).json({ ok: false, error: "token already used" });

      const priceId = env.STRIPE_PRICE_ID_LIGHT || null;
      const paymentLink = env.STRIPE_PAYMENT_LINK_LIGHT || null;

      const successUrl =
        pickUrl(env, "STRIPE_SUCCESS_URL", null) ||
        pickUrl(env, "PUBLIC_BASE_URL", null) ||
        "https://example.com";
      const cancelUrl =
        pickUrl(env, "STRIPE_CANCEL_URL", null) ||
        pickUrl(env, "PUBLIC_BASE_URL", null) ||
        "https://example.com";

      if (paymentLink && !priceId) {
        const url = paymentLink.includes("?")
          ? `${paymentLink}&client_reference_id=${encodeURIComponent(token)}`
          : `${paymentLink}?client_reference_id=${encodeURIComponent(token)}`;
        return res.json({ ok: true, url, mode: "payment_link" });
      }

      if (!priceId) {
        return res.status(500).json({ ok: false, error: "STRIPE_PRICE_ID_LIGHT is not set" });
      }

      const stripe = createStripeClient(env);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: token,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          product: "blueprint_light",
          token,
          line_user_id: tokenDoc.data?.line_user_id || "",
        },
      });

      return res.json({ ok: true, url: session.url, session_id: session.id, mode: "checkout_session" });
    } catch (e) {
      console.error("[stripe] checkout light failed:", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --------------------
  // webhook
  // --------------------
  router.post("/webhook", rawBody({ limitBytes: 2 * 1024 * 1024, parseJson: false }), async (req, res) => {
    const sig = req.header("stripe-signature");
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET || null;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ ok: false, error: "missing stripe-signature or STRIPE_WEBHOOK_SECRET" });
    }

    try {
      const stripe = createStripeClient(env);
      const raw = req.rawBody;
      const event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);

      if (event.type !== "checkout.session.completed") {
        return res.json({ ok: true, received: true, ignored: true });
      }

      const session = event.data?.object || {};
      const meta = session.metadata || {};
      const tokenFromMeta = String(meta.token || "").trim();
      const token = String(session.client_reference_id || tokenFromMeta || "").trim();
      const lineUserIdFromMeta = String(meta.line_user_id || "").trim();
      const tokenSource = session.client_reference_id ? "client_reference_id" : (tokenFromMeta ? "metadata" : "none");

      console.log("[stripe] checkout.session.completed", {
        token_source: tokenSource,
        token_tail: token ? token.slice(-4) : null,
        has_line_user_id: !!lineUserIdFromMeta,
        session_id: session.id || null,
      });

      if (!token) {
        if (!lineUserIdFromMeta) {
          return res.json({ ok: true, received: true, ignored: true, reason: "missing client_reference_id" });
        }
        // fallback: token無しでも line_user_id があれば購入フラグを書く
        await db.collection("line_users").doc(lineUserIdFromMeta).set(
          {
            purchases: {
              blueprint_light: {
                purchased: true,
                purchased_at: admin.firestore.FieldValue.serverTimestamp(),
                stripe_session_id: session.id || null,
              },
            },
          },
          { merge: true }
        );
        return res.json({ ok: true, received: true, fallback: "line_user_id_only" });
      }

      const tokenDoc = await getPurchaseToken({ db, token });
      if (!tokenDoc?.exists) {
        return res.json({ ok: true, received: true, ignored: true, reason: "token not found" });
      }

      const tokenData = tokenDoc.data || {};
      if (tokenData.used) {
        return res.json({ ok: true, received: true, ignored: true, reason: "token already used" });
      }
      if (tokenData.product && tokenData.product !== "blueprint_light") {
        return res.json({ ok: true, received: true, ignored: true, reason: "product mismatch" });
      }

      const lineUserId = tokenData.line_user_id || lineUserIdFromMeta || null;
      if (!lineUserId) {
        return res.json({ ok: true, received: true, ignored: true, reason: "missing line_user_id" });
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      const tokenRef = db.collection("purchase_tokens").doc(token);
      const lineRef = db.collection("line_users").doc(lineUserId);

      batch.set(
        lineRef,
        {
          purchases: {
            blueprint_light: {
              purchased: true,
              purchased_at: now,
              stripe_session_id: session.id || null,
            },
          },
        },
        { merge: true }
      );

      batch.set(
        tokenRef,
        {
          used: true,
          used_at: now,
          stripe_session_id: session.id || null,
        },
        { merge: true }
      );

      await batch.commit();

      // 1) LINE push: preparing message
      try {
        if (env.LINE_CHANNEL_ACCESS_TOKEN && lineUserId) {
          const lineApiClient = createLineApi({
            accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
            maxText: Number(env.MAX_LINE_TEXT || 4800),
          });
          const msg = LINE_COPY?.BLUEPRINT_PREPARING_PUSH ||
            "🌌 LIGHT：設計図の準備を開始しました。整い次第、このトークに『設計図を開く』ボタンが届きます。";
          await lineApiClient.pushMessages(lineUserId, { type: "text", text: msg });
        }
      } catch (e) {
        console.log("[stripe] push preparing failed:", e?.message || String(e));
      }

      // 2) Cloud Tasks enqueue (async generate)
      try {
        await enqueueBlueprintGenerate({ env, lineUserId, blueprintType: "light" });
      } catch (e) {
        console.log("[stripe] enqueue generate failed:", e?.message || String(e));
      }

      return res.json({ ok: true, received: true });
    } catch (e) {
      console.error("[stripe] webhook failed:", e);
      return res.status(400).json({ ok: false, error: e?.message || String(e) });
    }
  });

  return router;
}

module.exports = { createStripeRouter };
