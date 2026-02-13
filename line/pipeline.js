"use strict";

const intent = require("./intent");

async function processCommand({ rawText, cmd, appUserId, lineUserId, modules, renderers }) {
  const { natal, story } = modules;

  // 0) SORA (public固定)
  const soraMode = intent.soraModeFromCommand(rawText || cmd);
  if (soraMode) {
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
