"use strict";

const { listWithOrb } = require("../aspect/selection");
const { normalizeBodyKey } = require("../canonical");
const { CORE_PLANETS, MINOR_BODIES } = require("../astro/constants");
const { aspectInfo, signJa } = require("../../presenters/format/format/common");
const { bodyLabelJa } = require("../../presenters/shared/text/tokens");

function collectMonthlyPoints({ story, resonanceMode } = {}) {
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const coreBodies = new Set(CORE_PLANETS);
  const deepBodies = new Set(MINOR_BODIES);
  const mode = resonanceMode || story?.meta?.resonance_mode || "core";
  const all = listWithOrb(skyAll);
  const corePool = all.filter((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    return coreBodies.has(aKey) && coreBodies.has(bKey);
  });
  const deepPool = all.filter((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    return deepBodies.has(aKey) || deepBodies.has(bKey);
  });
  const useDeep = mode === "deep";
  return useDeep
    ? (deepPool.length ? deepPool : corePool)
    : (corePool.length ? corePool : deepPool);
}

function rankMonthlyPoints(rows = []) {
  return [...rows].sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg));
}

function formatMonthlyPoint({ row, dict }) {
  if (!row) return "";
  const aKey = normalizeBodyKey(row?.a || "");
  const bKey = normalizeBodyKey(row?.b || "");
  const aLabel = bodyLabelJa(dict, aKey);
  const bLabel = bodyLabelJa(dict, bKey);
  const aSign = row?.a_sign_ja || signJa(dict, row?.a_sign_key || "");
  const bSign = row?.b_sign_ja || signJa(dict, row?.b_sign_key || "");
  const aspect = aspectInfo(dict, row?.type || row?.aspect || row?.aspT, row?.aspect_deg);
  const aspectLabel = aspect?.label_ja || String(row?.type || row?.aspect || "");
  return `${aLabel}（${aSign}）×${bLabel}（${bSign}）｜${aspectLabel}`;
}

function buildMonthlyHighlights({ story, dict, max = 3, resonanceMode } = {}) {
  const pool = collectMonthlyPoints({ story, resonanceMode });
  const ranked = rankMonthlyPoints(pool).slice(0, max);
  return ranked.map((row) => formatMonthlyPoint({ row, dict })).filter(Boolean);
}

module.exports = {
  collectMonthlyPoints,
  rankMonthlyPoints,
  formatMonthlyPoint,
  buildMonthlyHighlights,
};
