"use strict";

/**
 * normalize.js
 * - render 全体で使う “正規化” のSSOT
 * - 副作用なし / story不要 / ctx不要
 * - normalizeAspectType は deep_space alias を吸収して “長キー” に寄せる
 * - normElement/normModality は signMeta の element/modality を安全に揃える
 */

// deep_space alias（短キー→V1の長キー）
const ASPECT_TYPE_ALIAS = Object.freeze({
  semi_sextile: "semi_sextile_30",
  semi_square: "semi_square_45",
  sesquisquare: "sesqui_square_135",
  sesqui_square: "sesqui_square_135",
  inconjunct: "quincunx_150",
  quincunx: "quincunx_150",
  quintile: "quintile_72",
  biquintile: "biquintile_144",
  septile: "septile_family",
  biseptile: "septile_family",
  triseptile: "septile_family",
});

function normalizeAspectType(type) {
  const k = String(type || "").trim().toLowerCase();
  if (!k) return "";
  return ASPECT_TYPE_ALIAS[k] || k;
}

function normElement(e) {
  const x = String(e || "").toLowerCase().trim();
  if (x === "火" || x === "fire") return "fire";
  if (x === "地" || x === "earth") return "earth";
  if (x === "風" || x === "air") return "air";
  if (x === "水" || x === "water") return "water";
  return ["fire", "earth", "air", "water"].includes(x) ? x : "unknown";
}

function normModality(m) {
  const x = String(m || "").toLowerCase().trim();
  if (x === "活動" || x === "cardinal") return "cardinal";
  if (x === "不動" || x === "fixed") return "fixed";
  if (x === "柔軟" || x === "mutable") return "mutable";
  return ["cardinal", "fixed", "mutable"].includes(x) ? x : "unknown";
}

module.exports = {
  ASPECT_TYPE_ALIAS,
  normalizeAspectType,
  normElement,
  normModality,
};
