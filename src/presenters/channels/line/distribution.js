"use strict";

const {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildKinjitsuBlock,
} = require("../../../usecases/paid/line_paid_500");
const { SPEC } = require("../../../config/sora_spec");

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

async function renderDistributionLine(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const lines = [`🔵 観測ログ＋｜${dateLabel}`, ""];

  lines.push(...buildBunpuTop5(story, dict));
  lines.push("", SPEC.separators.section, "");

  lines.push("🏠 はうす（接点あり）", "");
  lines.push(...buildHouseBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push("🌙 つきじ（最大3）", "");
  lines.push(...buildTsukijiBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push(...buildKinjitsuBlock(story, dict, asOfISO));

  return lines.join("\n").trim();
}

module.exports = { renderDistributionLine };
