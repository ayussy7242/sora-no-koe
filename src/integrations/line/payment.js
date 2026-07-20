"use strict";

const Stripe = require("stripe");
const env = require("../../config/env");
const { LINE_COPY } = require("../../content/copy");
const { getLineSubscription, isPaidLine500 } = require("../firebase/subscription");

const PAID_INTENTS = new Set(env.PAID_INTENTS || []);

async function isPaidAllowed({ appUserId, lineUserId, modules }) {
  if (!env.PAID_MODE_ENABLED) return true;

  if (env.PAID_ALLOW_OWNER) {
    if (env.OWNER_LINE_USER_ID && lineUserId === env.OWNER_LINE_USER_ID) return true;
    if (env.OWNER_APP_USER_ID && appUserId === env.OWNER_APP_USER_ID) return true;
  }

  if (appUserId && env.PAID_ALLOW_APP_USER_IDS?.includes(appUserId)) return true;
  if (lineUserId && env.PAID_ALLOW_LINE_USER_IDS?.includes(lineUserId)) return true;

  if (lineUserId && modules?.user?.getLineUserDeepMode) {
    const deep = await modules.user.getLineUserDeepMode(lineUserId);
    if (deep === true) return true;
  }

  return false;
}

function paidOnlyMessage(mode) {
  const map = LINE_COPY.PAID_ONLY_MESSAGES || {};
  return map?.[mode] || LINE_COPY.PAID_ONLY || "このコマンドは深層モードで配信中だよ。";
}

async function getPaidStatus({ db, appUserId, lineUserId }) {
  let paid = false;
  try {
    const sub = await getLineSubscription(db, lineUserId);
    paid = isPaidLine500(sub);
  } catch (_) {
    paid = false;
  }
  return { paid };
}

function pickUrl(envObj, key, fallback) {
  const v = envObj?.[key];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

async function createCheckoutUrlForLine500({ lineUserId }) {
  const priceId = env.STRIPE_PRICE_ID_LINE_500 || null;
  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return { ok: false, error: "stripe_config_missing" };
  }

  const successUrl =
    pickUrl(env, "STRIPE_SUCCESS_URL", null) ||
    pickUrl(env, "PUBLIC_BASE_URL", null) ||
    "https://example.com";
  const cancelUrl =
    pickUrl(env, "STRIPE_CANCEL_URL", null) ||
    pickUrl(env, "PUBLIC_BASE_URL", null) ||
    "https://example.com";

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      product: "line_500",
      plan: "line_500",
      line_user_id: lineUserId || "",
    },
    subscription_data: {
      metadata: {
        product: "line_500",
        plan: "line_500",
        line_user_id: lineUserId || "",
      },
    },
  });

  return { ok: true, url: session.url, mode: "checkout_session" };
}

function formatEpochDate(epochSec) {
  const n = Number(epochSec);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

async function createPortalUrl({ lineUserId, db }) {
  if (!env.STRIPE_SECRET_KEY) return { ok: false, error: "stripe_config_missing" };
  const sub = await getLineSubscription(db, lineUserId);
  const customerId = sub?.stripe_customer_id || null;
  if (!customerId) return { ok: false, error: "customer_missing" };

  const returnUrl =
    pickUrl(env, "STRIPE_CANCEL_URL", null) ||
    pickUrl(env, "PUBLIC_BASE_URL", null) ||
    "https://example.com";

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { ok: true, url: session.url };
}

module.exports = {
  PAID_INTENTS,
  isPaidAllowed,
  paidOnlyMessage,
  getPaidStatus,
  createCheckoutUrlForLine500,
  formatEpochDate,
  createPortalUrl,
};
