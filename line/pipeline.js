"use strict";

const intent = require("./intent");
const env = require("../config/env");
const { LINE_COPY } = require("../copy");

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

async function processCommand({ rawText, cmd, appUserId, lineUserId, modules, renderers }) {
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

  return { text: story.renderFallback() || "コマンドがわからなかった🌌", stage: "fallback" };
}

module.exports = { processCommand };
