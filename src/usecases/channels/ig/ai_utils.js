"use strict";

const { signJa } = require("../../../presenters/format/format/common");

function resolveMaxRetries({ maxRetries, openaiMaxRetries, envKey = "IG_AI_MAX_RETRIES" } = {}) {
  const envRaw = process.env[envKey];
  const envNum = Number(envRaw);
  if (Number.isFinite(envNum)) return Math.max(0, envNum);

  const openaiNum = Number(openaiMaxRetries);
  if (Number.isFinite(openaiNum)) return Math.max(0, openaiNum);

  const base = Number(maxRetries);
  if (Number.isFinite(base)) return Math.max(0, base);

  return 0;
}

function buildSignCountsLine({ story, dict }) {
  const transit = story?.meta?.transit_signs || story?.public?.transit_signs || {};
  const counts = {};
  Object.values(transit).forEach((item) => {
    const signKey = item?.sign_key;
    const label = item?.sign_ja || signJa(dict, signKey || "");
    if (!label) return;
    counts[label] = (counts[label] || 0) + 1;
  });
  const entries = Object.entries(counts)
    .map(([sign, count]) => `${sign}=${count}`)
    .sort();
  return entries.length ? entries.join(", ") : "none";
}

function buildElementCountsLine(story) {
  const counts = story?.meta?.element_count || story?.meta?.sky_strata?.element_count || story?.public?.sky_strata?.element_count || {};
  const labels = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合" };
  const entries = Object.entries(counts)
    .map(([key, count]) => `${labels[key] || key}=${Number(count || 0)}`)
    .sort();
  return entries.length ? entries.join(", ") : "none";
}

function buildHouseFocusLine(story) {
  const focus = story?.public?.house_focus || {};
  const top = focus?.top?.[0];
  if (!top) return "none";
  const total = Number(focus?.total || 0);
  const count = Number(top?.count || 0);
  return `第${top.house_no}ハウス（${count}/${total}）`;
}

module.exports = {
  resolveMaxRetries,
  buildSignCountsLine,
  buildElementCountsLine,
  buildHouseFocusLine,
};
