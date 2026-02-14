"use strict";

const intent = require("./intent");
const env = require("../config/env");
const { LINE_COPY } = require("../copy");
const dict = require("../dict");
const Stripe = require("stripe");
const { createPurchaseToken } = require("../engine/purchase_tokens");
const { createBlueprintLightService } = require("../engine/blueprint_light");

const PAID_SORA_MODES = new Set(env.PAID_SORA_MODES || []);
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

function pickUrl(envObj, key, fallback) {
  const v = envObj?.[key];
  return v && String(v).trim() ? String(v).trim() : fallback;
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

  // 0) SORA (public固定)
  const soraMode = intent.soraModeFromCommand(rawText || cmd);
  if (soraMode) {
    if (env.PAID_MODE_ENABLED && PAID_SORA_MODES.has(soraMode)) {
      if (!(await isPaidAllowed({ appUserId, lineUserId, modules }))) {
        return { text: paidOnlyMessage(soraMode), stage: "paid_only", mode: soraMode };
      }
    }
    let hasPersonal = false;
    try {
      hasPersonal = await natal.hasNatal(appUserId);
    } catch (_) {
      hasPersonal = false;
    }
    // "ちんもく" は登録済みなら personal を返す
    const usePersonalSilent = soraMode === "sora_ura_silent" && hasPersonal;
    const { story: storyJson } = usePersonalSilent
      ? await story.buildToday({ appUserId })
      : await story.buildSky();
    const text = storyJson
      ? await (usePersonalSilent ? renderers.renderSoraUraSilentPersonalLine(storyJson)
        : soraMode === "sora_all" ? renderers.renderSoraAllLine(storyJson)
        : soraMode === "sora_ura" ? renderers.renderSoraUraLine(storyJson)
        : soraMode === "sora_ura_silent" ? renderers.renderSoraUraSilentLine(storyJson)
        : soraMode === "sora_ura_rare" ? renderers.renderSoraUraRareLine(storyJson)
        : soraMode === "sora_ura_harmony" ? renderers.renderSoraUraHarmonyLine(storyJson)
        : renderers.renderSoraLine(storyJson))
      : "（そらのデータがまだなかった🙏）";
    if (soraMode === "sora_ura_silent" && !usePersonalSilent) {
      return { text: story.appendTail(text, story.tailSoraSilentNoPersonal()), stage: "sora", mode: soraMode };
    }
    if (!hasPersonal) {
      return { text: story.appendTail(text, story.tailSoraNoPersonal()), stage: "sora", mode: soraMode };
    }
    return { text, stage: "sora", mode: soraMode };
  }

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

  if (intentKey === intent.INTENT.NATAL) {
    const r = await natal.handleNatalList({ appUserId });
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "natal_list" };
  }

  if (intentKey === intent.INTENT.PUBLIC_SKY) {
    const r = await story.buildSky();
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "public_sky" };
  }

  if (intentKey === intent.INTENT.PERSONAL_TODAY) {
    // ✅ ここが最重要：public は guide 付きに統一（debug/webhook 一致）
    if (!appUserId || appUserId === "public") {
      const r = await story.buildSkyWithGuide();
      return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "personal_today_no_user" };
    }
    const r = await story.buildToday({ appUserId });
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "personal_today" };
  }

  if (intentKey === intent.INTENT.ANSHIN) {
    if (env.PAID_MODE_ENABLED && PAID_INTENTS.has(intentKey)) {
      if (!(await isPaidAllowed({ appUserId, lineUserId, modules }))) {
        return { text: paidOnlyMessage(intentKey), stage: "paid_only", mode: intentKey };
      }
    }
    let hasPersonal = false;
    try {
      hasPersonal = await natal.hasNatal(appUserId);
    } catch (_) {
      hasPersonal = false;
    }
    if (!hasPersonal) {
      const r = await story.buildAnshinPublic();
      return { text: story.appendTail(r?.text || story.renderFallback() || "（返す文が空だった🙏）", story.tailAnshinNoPersonal()), stage: "anshin_public" };
    }
    const r = await story.buildAnshin({ appUserId });
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "anshin" };
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

    let result = null;
    try {
      result = await blueprint?.getOrCreateSignedUrl({ lineUserId, appUserId });
    } catch (e) {
      console.log("[blueprint] error", { message: e?.message || String(e) });
      result = null;
    }
    console.log("[blueprint] result", {
      ok: !!result?.ok,
      code: result?.code || null,
      has_url: !!result?.url,
    });
    if (!result || !result.ok) {
      const msg =
        result?.code === "not_purchased"
          ? LINE_COPY.BLUEPRINT_NEED_PURCHASE
          : result?.code === "natal_not_ready" || result?.code === "not_ready"
            ? LINE_COPY.BLUEPRINT_NOT_READY
            : LINE_COPY.BLUEPRINT_PURCHASE_UNAVAILABLE;
      return { text: msg || "設計図の準備中だよ。", stage: "blueprint_light" };
    }

    const signedUrl = result.url;
    const templateMessage = {
      type: "template",
      altText: "魂の設計図（LIGHT）はこちら",
      template: {
        type: "buttons",
        title: "魂の設計図（LIGHT）",
        text: "あなた専用の設計図です🌌",
        actions: [
          {
            type: "uri",
            label: "設計図を開く",
            uri: signedUrl,
          },
        ],
      },
    };
    return { message: templateMessage, stage: "blueprint_light" };
  }

  return { text: story.renderFallback() || "コマンドがわからなかった🌌", stage: "fallback" };
}

module.exports = { processCommand };
