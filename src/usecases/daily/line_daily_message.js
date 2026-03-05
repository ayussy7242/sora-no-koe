"use strict";

const { renderSoraLine } = require("../../presenters/channels/line/sora");
const { renderDistributionLine } = require("../../presenters/channels/line/distribution");
const { SPEC } = require("../../config/sora_spec");

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

async function buildDailyLineMessage({ story, dict, isPaid500 } = {}) {
  if (!story) throw new Error("buildDailyLineMessage: story required");

  const useDict = dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);

  const freeSoraBody = await renderSoraLine(story, { dict: useDict, includeHeader: false });
  const paidBody = isPaid500
    ? await renderDistributionLine(story, { dict: useDict })
    : null;

  const lines = [];

  lines.push(`🌌 きょうのそら｜${dateLabel}`, "");
  if (freeSoraBody) lines.push(freeSoraBody);

  if (paidBody) {
    const paidLines = String(paidBody || "").split("\n");
    if (paidLines[0] && paidLines[0].startsWith("🔵 観測ログ＋")) {
      paidLines[0] = "🔵 観測ログ＋";
    }
    lines.push("", SPEC.separators.section, "", paidLines.join("\n").trim());
  }
  return lines.join("\n").trim();
}

module.exports = { buildDailyLineMessage };
