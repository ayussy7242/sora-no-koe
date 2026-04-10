"use strict";

const { renderLine } = require("../../../presenters/line/today");
const { renderSoraLine } = require("../../../presenters/line/sora");
const { renderDistributionLine } = require("../../../presenters/line/distribution");
const { SPEC } = require("../../../config/sora_spec");
const env = require("../../../config/env");
const { formatDateLabel } = require("../../../utils/time");

async function buildDailyLineMessage({ story, dict, isPaid500, deepMode } = {}) {
  if (!story) throw new Error("buildDailyLineMessage: story required");

  const useDict = dict || require("../../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);

  const freeSoraBody = await renderSoraLine(story, {
    dict: useDict,
    includeHeader: false,
    includeHouse: isPaid500 === true,
    resonanceMode: "core",
  });
  const freeTodayBody = await renderLine(story, { dict: useDict, includeHeader: false });
  const paidBody = isPaid500
    ? await renderDistributionLine(story, { dict: useDict })
    : null;
  const plusEnabled = !!env.PLUS_ENABLED;

  const lines = [];

  lines.push(`🌌 きょうのそら｜${dateLabel}`, "");
  if (freeSoraBody) lines.push(freeSoraBody);

  lines.push("", "", SPEC.separators.section, "", "⭐ あなたのほし×きょうのそら", "");
  if (freeTodayBody) lines.push(freeTodayBody);

  if (!paidBody) {
    if (plusEnabled) {
      const plusUrl = env?.SORA_PLUS_URL || null;
      const plusLine = plusUrl
        ? `ソラの観測をもう少し深く見る ▶ ソラぷらす ${plusUrl}`
        : "ソラの観測をもう少し深く見る ▶ ソラぷらす";
      lines.push(
        "",
        SPEC.separators.section,
        "",
        "🔵 観測ログ＋（ぶんぷ / ハウス / つきじ / 近日）",
        plusLine
      );
    } else {
      lines.push("", SPEC.separators.section, "", "🔵 観測ログ＋｜近日公開");
    }
  } else {
    const paidLines = String(paidBody || "").split("\n");
    if (paidLines[0] && paidLines[0].startsWith("🔵 観測ログ＋")) {
      paidLines[0] = "🔵 観測ログ＋";
    }
    lines.push("", SPEC.separators.section, "", paidLines.join("\n").trim());
  }
  return lines.join("\n").trim();
}

module.exports = { buildDailyLineMessage };
