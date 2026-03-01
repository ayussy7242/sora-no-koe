"use strict";

const { renderLine } = require("./channels/line_today");
const { renderSoraLine } = require("./channels/line_sora");


function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

async function buildDailyLineMessage({ story, dict } = {}) {
  if (!story) throw new Error("buildDailyLineMessage: story required");

  const useDict = dict || require("../dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);

  const freeSoraBody = await renderSoraLine(story, { dict: useDict, includeHeader: false });
  const freeTodayBody = await renderLine(story, { dict: useDict, includeHeader: false });

  const lines = [];

  lines.push(`🌤 きょうのそら｜${dateLabel}`, "");
  if (freeSoraBody) lines.push(freeSoraBody);
  lines.push("", "────────", "");
  lines.push(`⭐ あなたの星 × きょう`, "");
  if (freeTodayBody) lines.push(freeTodayBody);
  lines.push("", "────────", "");
  lines.push("🔵 観測ログ＋｜近日公開");
  return lines.join("\n").trim();
}

module.exports = { buildDailyLineMessage };
