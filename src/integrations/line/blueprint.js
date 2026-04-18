"use strict";

const { createBlueprintLightService } = require("../../usecases/pdf/blueprint");
const { enqueueBlueprintGenerate } = require("../cloudtasks/tasks_queue");
const { LINE_COPY } = require("../../content/copy");
const { setLineUserBlueprintPhase } = require("./state");
const { BLUEPRINT_PHASE } = require("../../domain/lifecycle/enums");

async function handleBlueprintLight({
  appUserId,
  lineUserId,
  natal,
  db,
  admin,
  storage,
  env,
  dict,
  logger = console.log,
} = {}) {
  logger("[blueprint] start", { line_user_id: lineUserId || null, app_user_id: appUserId || null });

  if (!lineUserId) {
    return { text: LINE_COPY.BLUEPRINT_NEED_LINE || "この操作はLINEから使ってね。", stage: "blueprint_light" };
  }

  const hasPersonal = await natal?.hasNatal?.(appUserId);
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
    logger("[blueprint] error", { message: e?.message || String(e) });
    resultMobile = null;
  }

  logger("[blueprint] result", {
    ok: !!resultMobile?.ok,
    code: resultMobile?.code || null,
    has_url: !!resultMobile?.url,
  });

  if (!resultMobile || !resultMobile.ok) {
    const code = resultMobile?.code || "";
    if (code === "not_ready") {
      await enqueueBlueprintGenerate({ env, lineUserId, blueprintType: "light" }).catch(() => {});
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.QUEUED_BLUEPRINT,
        eventType: "blueprint_queued",
      });
    }
    const msg =
      code === "natal_not_ready" || code === "not_ready"
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
    altText: "星の設計図（Blueprint v25）",
    template: {
      type: "buttons",
      title: "星の設計図（Blueprint v25）",
      text: "設計図を開く",
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

module.exports = {
  handleBlueprintLight,
};
