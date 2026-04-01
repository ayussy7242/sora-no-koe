"use strict";

const { formatDateLabel: formatDateLabelRaw } = require("../../../utils/time");
const { joinLines } = require("../../../utils/text/format");

function formatDateLabel(story) {
  return formatDateLabelRaw(story?.meta?.date_local || "");
}

function getMoonSignJa(story, publicSignJa) {
  const direct = story?.public?.moon?.sign_ja || "";
  if (direct) return direct;
  if (typeof publicSignJa === "function") return publicSignJa(story, "moon") || "";
  return "";
}

function joinAndTrimLines(lines) {
  return joinLines(lines, { trim: true, collapseBlank: true, filterNull: false });
}

module.exports = { formatDateLabel, getMoonSignJa, joinAndTrimLines };
