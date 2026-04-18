"use strict";

const { normalizeAspectKey } = require("../canonical");

const MAJOR_ASPECTS = Object.freeze([
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
]);

const HARD_ASPECTS = Object.freeze([
  "square",
  "opposition",
  "semi_square_45",
  "sesqui_square_135",
  "quincunx_150",
]);

const MAJOR_ASPECT_SET = new Set(MAJOR_ASPECTS);
const HARD_ASPECT_SET = new Set(HARD_ASPECTS);
const ASPECT_ALIAS_MAP = Object.freeze({
  semi_sextile: "semi_sextile_30",
  semisextile: "semi_sextile_30",
  semi_square: "semi_square_45",
  semisquare: "semi_square_45",
  sesqui_square: "sesqui_square_135",
  sesquisquare: "sesqui_square_135",
  inconjunct: "quincunx_150",
  quincunx: "quincunx_150",
  quintile: "quintile_72",
  biquintile: "biquintile_144",
  septile: "septile_family",
  biseptile: "septile_family",
  triseptile: "septile_family",
  novile: "novile_40",
  binovile: "binovile_80",
  quadranovile: "quadranovile_160",
  decile: "decile_36",
  tridecile: "tridecile_108",
});

function normalizeAspectType(raw, aspectDeg = null) {
  const hasAspectDeg = aspectDeg !== null && aspectDeg !== undefined && String(aspectDeg).trim() !== "";
  const resolvedDeg = hasAspectDeg && Number.isFinite(Number(aspectDeg)) ? Number(aspectDeg) : undefined;
  const input = String(raw || "").trim().toLowerCase();
  const base = input.replace(/_\d+$/, "");
  return normalizeAspectKey(ASPECT_ALIAS_MAP[base] || base || input, resolvedDeg);
}

function getAspectMeta(dict, rawType, aspectDeg = null) {
  const key = normalizeAspectType(rawType, aspectDeg);
  if (!key) return null;

  const v2 = dict?.ASPECTS_V2 || {};
  const v1 = dict?.ASPECTS_V1 || {};
  const pools = [
    { group: "major", pool: v2.major },
    { group: "deep", pool: v2.deep_space },
    { group: "craft", pool: v2.craft_space },
    { group: "major", pool: v1.major },
    { group: "deep", pool: v1.deep_space },
    { group: "craft", pool: v1.craft_space },
  ];

  for (const { group, pool } of pools) {
    if (pool && pool[key]) {
      return { key, group, meta: pool[key] };
    }
  }

  if (aspectDeg !== null && aspectDeg !== undefined && String(aspectDeg).trim() !== "" && Number.isFinite(Number(aspectDeg))) {
    const target = Number(aspectDeg);
    for (const { group, pool } of pools) {
      if (!pool) continue;
      for (const [poolKey, value] of Object.entries(pool)) {
        if (Number.isFinite(Number(value?.deg)) && Number(value.deg) === target) {
          return { key: poolKey, group, meta: value };
        }
      }
    }
  }

  return { key, group: "unknown", meta: null };
}

function getAspectLabel(dict, rawType, aspectDeg = null, fallbackLabel = "") {
  const resolved = getAspectMeta(dict, rawType, aspectDeg);
  return resolved?.meta?.label_ja || String(fallbackLabel || rawType || "").trim();
}

function isMajorAspect(rawType, aspectDeg = null) {
  return MAJOR_ASPECT_SET.has(normalizeAspectType(rawType, aspectDeg));
}

function isHardAspect(rawType, aspectDeg = null) {
  return HARD_ASPECT_SET.has(normalizeAspectType(rawType, aspectDeg));
}

module.exports = {
  HARD_ASPECTS,
  MAJOR_ASPECTS,
  getAspectLabel,
  getAspectMeta,
  isHardAspect,
  isMajorAspect,
  normalizeAspectType,
};
