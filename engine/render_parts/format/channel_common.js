"use strict";

function formatDateLabel(story) {
  return String(story?.meta?.date_local || "").replace(/-/g, ".");
}

function getMoonSignJa(story, publicSignJa) {
  const direct = story?.public?.moon?.sign_ja || "";
  if (direct) return direct;
  if (typeof publicSignJa === "function") return publicSignJa(story, "moon") || "";
  return "";
}

function joinAndTrimLines(lines) {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { formatDateLabel, getMoonSignJa, joinAndTrimLines };
