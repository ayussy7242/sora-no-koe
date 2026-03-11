"use strict";

const intent = require("./intent");
const env = require("../../config/env");
const { LINE_COPY } = require("../../content/copy");
const dict = require("../../content/dict");
const Stripe = require("stripe");
const { createPurchaseToken } = require("../firebase/purchase_tokens");
const { createBlueprintLightService } = require("../../usecases/blueprint_light");
const { getLineSubscription, isPaidLine500 } = require("../firebase/subscription");
const {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildElementModalityBlock,
  buildKinjitsuBlock,
} = require("../../usecases/channels/line/line_paid_500");
const { buildAndStoreSoraWheel } = require("../../engine/graphics/sora_wheel");

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

async function createCheckoutUrlForLight({ token, lineUserId }) {
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
    return { ok: true, url, mode: "payment_link" };
  }

  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return { ok: false, error: "stripe_config_missing" };
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: token,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      product: "blueprint_light",
      token,
      line_user_id: lineUserId || "",
    },
  });

  return { ok: true, url: session.url, mode: "checkout_session" };
}

async function hasBlueprintPurchase({ db, lineUserId }) {
  if (!db || !lineUserId) return false;
  const snap = await db.collection("line_users").doc(lineUserId).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  return data?.purchases?.blueprint_light?.purchased === true;
}

async function processCommand({ rawText, cmd, appUserId, lineUserId, modules, renderers, db, admin, storage }) {
  const { natal, story } = modules;

  // 1) utilities（intentより先）
  const util = await story.handleUtilities({ cmd, appUserId, lineUserId });
  if (util?.text != null) return { text: util.text, stage: "utilities" };

  // 2) natal collect（登録中ならここで吸う）
  if (lineUserId) {
    const collected = await natal.handleCollect({ lineUserId, appUserId, rawText });
    if (collected?.text != null) return { text: collected.text, stage: "collect" };
  }

  // 3) intent（唯一の判定）
  const intentKey = intent.intentFromcommand(cmd);

  const plusEnabled = !!env.PLUS_ENABLED;

  if (intentKey === intent.INTENT.PLUS_MENU || intentKey === intent.INTENT.PLUS_JOIN) {
    if (!plusEnabled) {
      return {
        text: LINE_COPY.PLUS_PAUSED || "観測ログ＋は現在準備中です。",
        stage: "plus_menu_paused",
      };
    }
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "plus_join" };
    }
    const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
    if (paid) {
      return {
        text: LINE_COPY.PLUS_ALREADY || "観測ログ＋は、朝配信の続きに毎日自動で付いています。",
        stage: "plus_join_already",
      };
    }
    let checkout = null;
    try {
      checkout = await createCheckoutUrlForLine500({ lineUserId });
    } catch (e) {
      checkout = null;
    }
    const url = checkout?.url || env.SORA_PLUS_URL || null;
    if (!url) {
      return {
        text: LINE_COPY.PLUS_UNAVAILABLE || "いま入会導線の準備中だよ。",
        stage: "plus_join_unavailable",
      };
    }
    const inviteText =
      typeof LINE_COPY.PLUS_INVITE === "function"
        ? LINE_COPY.PLUS_INVITE(url)
        : `観測ログ＋ 入会はこちら👇\n${url}`;
    return { text: inviteText, stage: "plus_join" };
  }

  if (intentKey === intent.INTENT.PLUS_CANCEL) {
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "plus_cancel" };
    }
    if (!plusEnabled) {
      return {
        text: LINE_COPY.PLUS_PAUSED || "観測ログ＋は現在準備中です。",
        stage: "plus_cancel_paused",
      };
    }
    const portal = await createPortalUrl({ lineUserId, db });
    if (!portal?.ok || !portal.url) {
      return {
        text: "解約はStripeの管理画面から行えます。お手数ですがサポートにご連絡ください。",
        stage: "plus_cancel_unavailable",
      };
    }
    return {
      text: "解約はこちら👇\n" + portal.url,
      stage: "plus_cancel",
    };
  }

  if (intentKey === intent.INTENT.PLUS_STATUS) {
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "plus_status" };
    }
    if (!plusEnabled) {
      return {
        text: LINE_COPY.PLUS_PAUSED || "観測ログ＋は現在準備中です。",
        stage: "plus_status_paused",
      };
    }
    const sub = await getLineSubscription(db, lineUserId);
    const status = sub?.subscription_status || "inactive";
    const plan = sub?.plan || "-";
    return {
      text: `観測ログ＋ 状態：${status}\nプラン：${plan}`,
      stage: "plus_status",
    };
  }

  if (intentKey === intent.INTENT.PLUS_EXPIRE) {
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "plus_expire" };
    }
    if (!plusEnabled) {
      return {
        text: LINE_COPY.PLUS_PAUSED || "観測ログ＋は現在準備中です。",
        stage: "plus_expire_paused",
      };
    }
    const sub = await getLineSubscription(db, lineUserId);
    const date = formatEpochDate(sub?.current_period_end);
    if (!date) {
      return { text: "期限情報が見つかりませんでした。", stage: "plus_expire_missing" };
    }
    return { text: `次回更新日：${date}`, stage: "plus_expire" };
  }

  if (intentKey === intent.INTENT.NATAL) {
    const r = await natal.handleNatalList({ appUserId });
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "natal_list" };
  }

  if (intentKey === intent.INTENT.PUBLIC_SKY) {
    const r = await story.buildSky();
    let isPaid = false;
    if (env.PAID_MODE_ENABLED) {
      const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
      const allow = await isPaidAllowed({ appUserId, lineUserId, modules });
      isPaid = paid || allow;
    }
    if (r?.story && typeof renderers?.renderSoraLine === "function") {
      const text = await renderers.renderSoraLine(r.story, { dict, paid: isPaid });
      return { text, stage: "public_sky" };
    }
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "public_sky" };
  }

  if (intentKey === intent.INTENT.PERSONAL_TODAY) {
    const r = await story.buildToday({ appUserId: appUserId || "public" });
    let isPaid = false;
    if (env.PAID_MODE_ENABLED) {
      const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
      const allow = await isPaidAllowed({ appUserId, lineUserId, modules });
      isPaid = paid || allow;
    }
    if (r?.story && typeof renderers?.renderLine === "function") {
      const text = await renderers.renderLine(r.story, { dict, paid: isPaid });
      return { text, stage: "personal_today" };
    }
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "personal_today" };
  }

  if (intentKey === intent.INTENT.DISTRIBUTION) {
    const hasPersonal = await natal.hasNatal(appUserId);
    if (!hasPersonal) {
      return { text: LINE_COPY.NATAL_LIST_NEED_LINK || "先に「はじめる」で登録してね。", stage: "distribution_need_natal" };
    }

    if (env.PAID_MODE_ENABLED && PAID_INTENTS.has(intentKey)) {
      const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
      const allow = await isPaidAllowed({ appUserId, lineUserId, modules });
      if (!paid && !allow) {
        return { text: paidOnlyMessage(intentKey), stage: "paid_only", mode: intentKey };
      }
    }

    const r = await story.buildToday({ appUserId });
    const text = r?.story
      ? await renderers.renderDistributionLine(r.story)
      : (r?.text || story.renderFallback() || "（返す文が空だった🙏）");
    return { text, stage: "distribution" };
  }

  if (
    intentKey === intent.INTENT.BUNPU ||
    intentKey === intent.INTENT.HOUSE ||
    intentKey === intent.INTENT.TSUKIJI ||
    intentKey === intent.INTENT.SORAZU
  ) {
    const hasPersonal = await natal.hasNatal(appUserId);
    if (!hasPersonal) {
      return { text: LINE_COPY.NATAL_LIST_NEED_LINK || "先に「はじめる」で登録してね。", stage: "paid_need_natal" };
    }

    if (env.PAID_MODE_ENABLED) {
      const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
      const allow = await isPaidAllowed({ appUserId, lineUserId, modules });
      if (!paid && !allow) {
        return { text: paidOnlyMessage(intentKey), stage: "paid_only", mode: intentKey };
      }
    }

    const r = await story.buildToday({ appUserId });
    const storyObj = r?.story;
    if (!storyObj) {
      return { text: story.renderFallback() || "（返す文が空だった🙏）", stage: "paid_empty" };
    }

    const dateLabel = String(storyObj?.meta?.date_local || "").replace(/-/g, ".");
    const asOfISO = storyObj?.meta?.as_of || null;

    if (intentKey === intent.INTENT.BUNPU) {
      const lines = [...buildBunpuTop5(storyObj, dict)];
      return { text: lines.join("\n").trim(), stage: "paid_bunpu" };
    }

    if (intentKey === intent.INTENT.HOUSE) {
      const lines = [`🏠 はうす（全ハウス）｜${dateLabel}`, "", ...buildHouseBlock(storyObj, dict, asOfISO)];
      return { text: lines.join("\n").trim(), stage: "paid_house" };
    }

    if (intentKey === intent.INTENT.TSUKIJI) {
      const lines = [`🌙 つきじ｜${dateLabel}`, "", ...buildTsukijiBlock(storyObj, dict, asOfISO)];
      return { text: lines.join("\n").trim(), stage: "paid_tsukiji" };
    }

    if (intentKey === intent.INTENT.SORAZU) {
      const bucketName = env.GCS_BUCKET_SORA || env.GCS_BUCKET_BLUEPRINTS || null;
      const expiresDays = Number(env.SORA_WHEEL_URL_EXPIRES_DAYS ?? 2);
      if (!storage || !bucketName) {
        return { text: "ソラ図の準備中だよ。", stage: "paid_sorazu_missing_storage" };
      }
      const wheel = await buildAndStoreSoraWheel({
        storage,
        bucketName,
        lineUserId,
        dateLocal: storyObj?.meta?.date_local,
        story: storyObj,
        dateLabel,
        expiresDays,
      });
      if (!wheel?.ok || !wheel?.url) {
        return { text: "ソラ図の生成に失敗したみたい。", stage: "paid_sorazu_failed" };
      }
      return {
        message: [{ type: "image", originalContentUrl: wheel.url, previewImageUrl: wheel.url }],
        stage: "paid_sorazu",
      };
    }
  }

  if (intentKey === intent.INTENT.PURCHASE) {
    console.log("[purchase] start", { line_user_id: lineUserId || null, app_user_id: appUserId || null });
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "purchase" };
    }
    const hasPersonal = await natal.hasNatal(appUserId);
    if (!hasPersonal) {
      return { text: LINE_COPY.BLUEPRINT_NEED_NATAL || "先に「はじめる」で登録してね。", stage: "purchase" };
    }

    if (!db || !admin) {
      return { text: LINE_COPY.BLUEPRINT_PURCHASE_UNAVAILABLE || "いま購入導線の準備中だよ。", stage: "purchase" };
    }

    if (await hasBlueprintPurchase({ db, lineUserId })) {
      return { text: LINE_COPY.BLUEPRINT_ALREADY_PURCHASED || "購入済みだよ。「設計図」でURLを返すね。", stage: "purchase" };
    }

    const token = await createPurchaseToken({
      db,
      admin,
      lineUserId,
      product: "blueprint_light",
      length: 10,
    });

    let checkout = null;
    try {
      checkout = await createCheckoutUrlForLight({ token, lineUserId });
    } catch (e) {
      console.log("[purchase] checkout error", { message: e?.message || String(e) });
      checkout = null;
    }
    console.log("[purchase] checkout", {
      line_user_id: lineUserId,
      token_tail: token.slice(-4),
      ok: !!checkout?.ok,
      mode: checkout?.mode || null,
      has_url: !!checkout?.url,
    });
    if (!checkout || !checkout.ok || !checkout.url) {
      return { text: LINE_COPY.BLUEPRINT_PURCHASE_UNAVAILABLE || "いま購入導線の準備中だよ。", stage: "purchase" };
    }

    const text =
      typeof LINE_COPY.BLUEPRINT_PURCHASE_READY === "function"
        ? LINE_COPY.BLUEPRINT_PURCHASE_READY(checkout.url)
        : `購入はこちら\n${checkout.url}`;
    return { text, stage: "purchase" };
  }

  if (intentKey === intent.INTENT.BLUEPRINT_LIGHT) {
    console.log("[blueprint] start", { line_user_id: lineUserId || null, app_user_id: appUserId || null });
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "blueprint_light" };
    }
    const hasPersonal = await natal.hasNatal(appUserId);
    if (!hasPersonal) {
      return { text: LINE_COPY.BLUEPRINT_NEED_NATAL || "先に「はじめる」で登録してね。", stage: "blueprint_light" };
    }

    if (!db || !admin || !storage) {
      return { text: LINE_COPY.BLUEPRINT_PURCHASE_UNAVAILABLE || "いま設計図の準備中だよ。", stage: "blueprint_light" };
    }

    let blueprint = null;
    try {
      blueprint = createBlueprintLightService({ db, admin, storage, env, dict });
    } catch (_) {
      blueprint = null;
    }

    let resultMobile = null;
    try {
      resultMobile = await blueprint?.getOrCreateSignedUrl({ lineUserId, appUserId, variant: "mobile" });
    } catch (e) {
      console.log("[blueprint] error", { message: e?.message || String(e) });
      resultMobile = null;
    }
    console.log("[blueprint] result", {
      ok: !!resultMobile?.ok,
      code: resultMobile?.code || null,
      has_url: !!resultMobile?.url,
    });
    if (!resultMobile || !resultMobile.ok) {
      const msg =
        resultMobile?.code === "not_purchased"
          ? LINE_COPY.BLUEPRINT_NEED_PURCHASE
          : resultMobile?.code === "natal_not_ready" ||
            resultMobile?.code === "not_ready"
            ? LINE_COPY.BLUEPRINT_NOT_READY
            : LINE_COPY.BLUEPRINT_PURCHASE_UNAVAILABLE;
      return { text: msg || "設計図の準備中だよ。", stage: "blueprint_light" };
    }

    const actions = [];
    if (resultMobile?.ok && resultMobile?.url) {
      actions.push({ type: "uri", label: "📱 モバイル版", uri: resultMobile.url });
    }
    const templateMessage = {
      type: "template",
      altText: "魂の設計図（LIGHT）はこちら",
      template: {
        type: "buttons",
        title: "魂の設計図（LIGHT）",
        text: "📱スマホ最適",
        actions: actions.length
          ? actions
          : [
              {
                type: "uri",
                label: "設計図を開く",
                uri: resultMobile?.url || "",
              },
            ],
      },
    };
    return { message: templateMessage, stage: "blueprint_light" };
  }

  return { text: story.renderFallback() || "コマンドがわからなかった🌌", stage: "fallback" };
}

module.exports = { processCommand };
