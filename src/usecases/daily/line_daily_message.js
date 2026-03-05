"use strict";

const { renderLine } = require("../../presenters/channels/line/today");
const { renderSoraLine } = require("../../presenters/channels/line/sora");
const { renderDistributionLine } = require("../../presenters/channels/line/distribution");
const { SPEC } = require("../../config/sora_spec");
const env = require("../../config/env");

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

async function buildDailyLineMessage({ story, dict, isPaid500 } = {}) {
  if (!story) throw new Error("buildDailyLineMessage: story required");

  const useDict = dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);

  const freeSoraBody = await renderSoraLine(story, {
    dict: useDict,
    includeHeader: false,
    includeHouse: isPaid500 === true,
  });
  const freeTodayBody = await renderLine(story, { dict: useDict, includeHeader: false });
  const paidBody = isPaid500
    ? await renderDistributionLine(story, { dict: useDict })
    : null;

  const lines = [];

  lines.push(`🌌 きょうのそら｜${dateLabel}`, "");
  if (freeSoraBody) lines.push(freeSoraBody);

  lines.push("", SPEC.separators.section, "", "⭐ あなたのほし×きょうのそら", "");
  if (freeTodayBody) lines.push(freeTodayBody);

  if (!paidBody) {
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
    const paidLines = String(paidBody || "").split("\n");
    if (paidLines[0] && paidLines[0].startsWith("🔵 観測ログ＋")) {
      paidLines[0] = "🔵 観測ログ＋";
    }
    lines.push("", SPEC.separators.section, "", paidLines.join("\n").trim());
  }
  return lines.join("\n").trim();
}

module.exports = { buildDailyLineMessage };
