"use strict";

const {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildRetrogradeOnlyBlock,
} = require("../../usecases/channels/line/paid_500");
const { SPEC } = require("../../config/sora_spec");

async function renderDistributionLine(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const asOfISO = story?.meta?.as_of || null;

  const lines = ["🔵 観測ログ＋", ""];

  const { bunpuLines } = buildBunpuTop5(story, dict);
  lines.push(...bunpuLines);
  lines.push("", SPEC.separators.section, "");

  lines.push("🏠 あなたのはうす（全ハウス）", "");
  lines.push(...buildHouseBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push("🌙 近日の共鳴", "");
  lines.push(...buildTsukijiBlock(story, dict, asOfISO));
  lines.push("", SPEC.separators.section, "");

  lines.push(...buildRetrogradeOnlyBlock(dict, asOfISO));
  lines.push("", SPEC.separators.section, "");
  lines.push("あなたのほし×きょうのそら の全共鳴は", "コマンド「うら」で確認できます🌌");

  return lines.join("\n").trim();
}

module.exports = { renderDistributionLine };
