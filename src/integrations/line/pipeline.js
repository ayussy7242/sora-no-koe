"use strict";

const intent = require("./intent");
const env = require("../../config/env");
const { LINE_COPY } = require("../../content/copy");
const dict = require("../../content/dict");
const { getLineSubscription } = require("../firebase/subscription");
const {
  PAID_INTENTS,
  isPaidAllowed,
  paidOnlyMessage,
  getPaidStatus,
  createCheckoutUrlForLine500,
  formatEpochDate,
  createPortalUrl,
} = require("./payment");
const { handleBlueprintLight } = require("./blueprint");
const {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildElementModalityBlock,
  buildKinjitsuBlock,
} = require("../../usecases/channels/line/paid_500");
const { buildAndStoreSoraWheel } = require("../../engine/graphics/sora_wheel");

async function processCommand({ rawText, cmd, appUserId, lineUserId, modules, renderers, db, admin, storage }) {
  const { natal, story, relation } = modules;

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
  const relationEnabled = ["1", "true", "yes", "on"].includes(String(env.RELATION_ENABLED || "").toLowerCase());
  const plusIntents = new Set([
    intent.INTENT.PLUS_MENU,
    intent.INTENT.PLUS_JOIN,
    intent.INTENT.PLUS_CANCEL,
    intent.INTENT.PLUS_STATUS,
    intent.INTENT.PLUS_EXPIRE,
  ]);

  if (plusIntents.has(intentKey)) {
    return { text: LINE_COPY.PLUS_PAUSED || "ただいま準備中です。", stage: "plus_paused_forced" };
  }

  if (!relationEnabled) {
    if (relation?.getRelationState && lineUserId) {
      const relState = await relation.getRelationState(lineUserId);
      if (relState?.state) await relation.clearRelationState?.(lineUserId);
    }
    if (intentKey === intent.INTENT.RELATION || intentKey === intent.INTENT.RELATION_REGISTER) {
      return { text: LINE_COPY.RELATION_PDF_UNAVAILABLE || "ただいま準備中です。", stage: "relation_unavailable" };
    }
  }

  const plusEnabled = !!env.PLUS_ENABLED;

  // 3.1) relation flow (番号待ち / 登録フロー)
  if (relationEnabled && relation?.getRelationState) {
    const relState = await relation.getRelationState(lineUserId);
    if (relState?.state) {
      if (env.PAID_MODE_ENABLED) {
        const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
        const allow = await isPaidAllowed({ appUserId, lineUserId, modules });
        if (!paid && !allow) {
          await relation.clearRelationState?.(lineUserId);
          return { text: paidOnlyMessage("relation"), stage: "relation_paid_only", mode: "relation" };
        }
      }
      if (relation.handleRelationRegisterStep) {
        const reg = await relation.handleRelationRegisterStep({ rawText, lineUserId, appUserId });
        if (reg) return reg;
      }
      if (relation.handleRelationSelection) {
        const relResult = await relation.handleRelationSelection({ rawText, lineUserId, appUserId });
        if (relResult) return relResult;
      }
    }
  }

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

  if (intentKey === intent.INTENT.RELATION) {
    if (!lineUserId) {
      return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "relation_need_line" };
    }
    if (env.PAID_MODE_ENABLED) {
      const { paid } = await getPaidStatus({ db, appUserId, lineUserId });
      const allow = await isPaidAllowed({ appUserId, lineUserId, modules });
      if (!paid && !allow) {
        return { text: paidOnlyMessage("relation"), stage: "relation_paid_only", mode: "relation" };
      }
    }
    if (!relation?.handleRelationCommand) {
      return { text: LINE_COPY.RELATION_PDF_UNAVAILABLE || "いま関係性PDFの準備中だよ。", stage: "relation_missing" };
    }
    return await relation.handleRelationCommand({ lineUserId, appUserId });
  }

  if (intentKey === intent.INTENT.RELATION_REGISTER) {
    if (!relation?.handleRelationRegisterCommand) {
      return { text: LINE_COPY.RELATION_PDF_UNAVAILABLE || "いま関係性PDFの準備中だよ。", stage: "relation_register_missing" };
    }
    return await relation.handleRelationRegisterCommand({ lineUserId, appUserId });
  }

  if (intentKey === intent.INTENT.NATAL) {
    const hasPersonal = await natal.hasNatal(appUserId);
    if (!hasPersonal) {
      return { text: LINE_COPY.NATAL_LIST_NEED_LINK || "先に「はじめる」で登録してね。", stage: "natal_need_link" };
    }
    const ready = await natal.isNatalReady?.(appUserId);
    if (!ready) {
      return { text: LINE_COPY.PERSONAL_PREPARING || LINE_COPY.NATAL_RECEIVED, stage: "personal_preparing" };
    }
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
    const hasPersonal = await natal.hasNatal(appUserId);
    if (!hasPersonal) {
      return { text: LINE_COPY.NATAL_LIST_NEED_LINK || "先に「はじめる」で登録してね。", stage: "personal_need_link" };
    }
    const ready = await natal.isNatalReady?.(appUserId);
    if (!ready) {
      return { text: LINE_COPY.PERSONAL_PREPARING || LINE_COPY.NATAL_RECEIVED, stage: "personal_preparing" };
    }
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
      const { bunpuLines } = buildBunpuTop5(storyObj, dict);
      const lines = [...bunpuLines];
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
    return {
      text:
        LINE_COPY.BLUEPRINT_FREE_INFO ||
        "設計図は無料で届くよ。登録済みならこのまま待てばOK。",
      stage: "purchase_free",
    };
  }

  if (intentKey === intent.INTENT.BLUEPRINT_LIGHT) {
    return handleBlueprintLight({
      appUserId,
      lineUserId,
      natal,
      db,
      admin,
      storage,
      env,
      dict,
      logger: console.log,
    });
  }

  return { text: story.renderFallback() || "コマンドがわからなかった🌌", stage: "fallback" };
}

module.exports = { processCommand };
