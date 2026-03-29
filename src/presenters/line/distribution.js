"use strict";

const {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildKinjitsuBlock,
} = require("../../usecases/channels/line/paid_500");
const { SPEC } = require("../../config/sora_spec");

async function renderDistributionLine(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const asOfISO = story?.meta?.as_of || null;

  const lines = ["🔵 観測ログ＋", ""];

  const { bunpuLines, uraLines } = buildBunpuTop5(story, dict);
  lines.push(...bunpuLines);
  lines.push("", SPEC.separators.section, "");

  lines.push("🏠 はうす（接点あり）", "");
  lines.push(...buildHouseBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push("🌙 つきじ（最大3）", "");
  lines.push(...buildTsukijiBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push(...buildKinjitsuBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push(...uraLines);

  return lines.join("\n").trim();
}

module.exports = { renderDistributionLine };
