"use strict";

const {
  BODY_GLYPH,
  BODY_LABEL_JA,
  SIGN_SYMBOL,
  SIGN_JA_TO_KEY,
  SIGN_NAME_TO_KEY,
} = require("../constants");
const { formatSignJa } = require("../utils");

function resolveSignKey(signJaOrName) {
  const sign = formatSignJa(signJaOrName || "");
  if (!sign) return "";
  return SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()] || "";
}

function formatJaDeg(signJa, deg, houseNo) {
  const degText = Number.isFinite(Number(deg)) ? ` ${Number(deg)}°` : "";
  const houseText = Number.isFinite(Number(houseNo)) ? `｜${Number(houseNo)}H` : "";
  return `${signJa || ""}${degText}${houseText}`.trim();
}

function formatSignWithGlyph(meta) {
  if (!meta) return "";
  const sign = formatSignJa(meta.sign_ja || meta.sign || "");
  if (!sign) return "";
  const signKey = meta.sign_key || resolveSignKey(sign);
  const signGlyph = SIGN_SYMBOL[signKey] || "";
  return `${signGlyph ? `${signGlyph} ` : ""}${formatJaDeg(sign, meta.deg, meta.house_no)}`.trim();
}

function formatAxisNode(meta) {
  if (!meta) return "";
  const sign = formatSignJa(meta.sign_ja || meta.sign || "");
  if (!sign) return "";
  const signKey = meta.sign_key || resolveSignKey(sign);
  const signGlyph = SIGN_SYMBOL[signKey] || "";
  const degText = Number.isFinite(Number(meta.deg)) ? ` ${Number(meta.deg)}°` : "";
  const houseText = Number.isFinite(Number(meta.house_no)) ? `｜${Number(meta.house_no)}H` : "";
  return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
}

function formatAxisSummary(meta) {
  if (!meta) return "";
  const sign = formatSignJa(meta.sign_ja || meta.sign || "");
  const house = Number.isFinite(Number(meta.house_no)) ? Number(meta.house_no) : null;
  if (sign && house) return `${sign}${house}H`;
  if (sign) return sign;
  if (house) return `${house}H`;
  return "";
}

function formatNodeWithGlyph(meta, label) {
  if (!meta) return "";
  const sign = formatSignJa(meta.sign_ja || meta.sign || "");
  if (!sign) return "";
  const signKey = meta.sign_key || resolveSignKey(sign);
  const signGlyph = SIGN_SYMBOL[signKey] || "";
  return `${label}　${signGlyph ? `${signGlyph} ` : ""}${formatJaDeg(sign, meta.deg, meta.house_no)}`.trim();
}

function formatAngleMeta(meta, label) {
  if (!meta) return "";
  const sign = formatSignJa(meta.sign_ja || meta.sign || "");
  if (!sign) return "";
  const signKey = meta.sign_key || resolveSignKey(sign);
  const signGlyph = SIGN_SYMBOL[signKey] || "";
  const degText = Number.isFinite(Number(meta.deg)) ? ` ${Number(meta.deg)}°` : "";
  const axisHouseMap = { ASC: 1, MC: 10, IC: 4, DC: 7 };
  const houseText = axisHouseMap[label] ? `｜${axisHouseMap[label]}H` : "";
  return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
}

function normalizeHouseNo(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 1 || i > 12) return null;
  return i;
}

function pickHouseNo(key, meta, houseByKey) {
  const direct = normalizeHouseNo(meta?.house_no);
  if (direct) return direct;
  return normalizeHouseNo(houseByKey.get(key));
}

function formatKeyPoint(label, meta, houseFallback = null) {
  if (!meta) return "";
  const sign = formatSignJa(meta.sign_ja || meta.sign || "");
  if (!sign) return "";
  const houseNo = normalizeHouseNo(meta.house_no) || normalizeHouseNo(houseFallback);
  return `${label} ${formatJaDeg(sign, meta.deg, houseNo)}`.trim();
}

function formatBodyLine(key, signByKey, houseByKey) {
  const sign = signByKey.get(key);
  const house = houseByKey.get(key);
  if (!sign) return "";
  const label = BODY_LABEL_JA[key] || key;
  const glyph = BODY_GLYPH[key] || "";
  const houseText = house ? `｜${house}H` : "";
  return `${glyph}${label}${sign}${houseText}`.trim();
}

module.exports = {
  formatJaDeg,
  formatSignWithGlyph,
  formatAxisNode,
  formatAxisSummary,
  formatNodeWithGlyph,
  formatAngleMeta,
  normalizeHouseNo,
  pickHouseNo,
  formatKeyPoint,
  formatBodyLine,
};
