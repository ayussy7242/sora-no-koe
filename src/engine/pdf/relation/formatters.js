"use strict";

const { buildGlyphImgTag } = require("../blueprint_v25/glyphs");
const { normalizeAspectType } = require("../../../domain/aspect/canonical");
const {
  AXIS_SYMBOLS,
  BODY_SHORT_LABELS,
  ELEMENT_LABELS,
  MODALITY_LABELS,
  ASPECT_DISPLAY,
} = require("./constants");

function escapeHtml(input) {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPlanetRow(entry) {
  if (!entry) return "";
  const axisKeys = new Set(["asc", "dc", "mc", "ic"]);
  const rawLabel = entry.body_glyph || entry.body_ja || entry.body_key || "";
  const bodyKey = String(entry?.body_key || "").toLowerCase();
  const axisPrefix = axisKeys.has(bodyKey) ? AXIS_SYMBOLS[bodyKey] : "";
  const labelText = axisKeys.has(bodyKey) ? "" : rawLabel;
  const label = axisPrefix ? `${axisPrefix} ${labelText}`.trim() : labelText;
  const sign = entry.sign_ja || entry.sign_key || "";
  const lon = entry.lon_deg;
  const deg = Number.isFinite(Number(lon)) ? Math.floor(((Number(lon) % 30) + 30) % 30) : null;
  const degText = Number.isFinite(Number(deg)) ? `${deg}°` : "";
  const signPart = [sign, degText].filter(Boolean).join(" ").trim();
  const house = Number.isFinite(Number(entry.house)) ? `${entry.house}H` : "";
  const parts = [label, signPart].filter(Boolean);
  let row = parts.join(" ").trim();
  if (house) row = row ? `${row}｜${house}` : house;
  return row || "—";
}

function formatBodyKeyShort(keyRaw) {
  const key = String(keyRaw || "").toLowerCase();
  return BODY_SHORT_LABELS[key] || key.toUpperCase() || "—";
}

function formatElementKey(keyRaw) {
  const key = String(keyRaw || "").toLowerCase();
  return ELEMENT_LABELS[key] || key || "—";
}

function formatModalityKey(keyRaw) {
  const key = String(keyRaw || "").toLowerCase();
  return MODALITY_LABELS[key] || key || "—";
}

function pickDominantElementKey(counts = {}) {
  const order = ["fire", "earth", "air", "water"];
  const entries = order.map((key) => ({ key, count: Number(counts[key] || 0) }));
  const max = Math.max(...entries.map((e) => e.count));
  if (!Number.isFinite(max) || max <= 0) return null;
  return entries.find((e) => e.count === max)?.key || null;
}

function topTwoFromCounts(counts = {}, labels = {}) {
  const entries = Object.entries(counts || {}).map(([k, v]) => ({ key: k, count: Number(v || 0) }));
  const sorted = entries.sort((a, b) => b.count - a.count).filter((r) => r.count > 0);
  if (!sorted.length) return "—";
  const max = sorted[0].count;
  const top = sorted.filter((r) => r.count === max).map((r) => labels[r.key] || r.key);
  return top.join("・") || "—";
}

function formatAspectLabel(aspectRaw) {
  const aspect = String(aspectRaw || "").toLowerCase();
  if (!aspect) return "";
  if (aspect === "same_sign") return "同サイン";
  if (aspect === "same_element") return "同元素";
  return aspect;
}

function shortName(name, max = 15) {
  const text = String(name || "").trim();
  if (text.length <= max) return text || "A";
  return `${text.slice(0, max)}...`;
}

function normalizeRelationAspectKey(aspectRaw) {
  const raw = String(aspectRaw || "").toLowerCase().trim();
  if (!raw) return "";
  if (raw === "same_sign") return "conjunction";
  if (raw === "same_element") return "trine";

  const key = normalizeAspectType(raw);
  const legacyMap = {
    quincunx_150: "quincunx",
    semi_sextile_30: "semisextile",
    semi_square_45: "semisquare",
    sesqui_square_135: "sesquiquadrate",
    quintile_72: "quintile",
    biquintile_144: "biquintile",
    novile_40: "novile",
    binovile_80: "binovile",
    quadranovile_160: "quadnovile",
    septile_family: "septile",
    decile_36: "decile",
    tridecile_108: "tridecile",
  };
  return legacyMap[key] || key;
}

function formatOrbValue(orbRaw) {
  if (!Number.isFinite(Number(orbRaw))) return "0.00";
  return Number(orbRaw).toFixed(2);
}

function formatConnectionSideHtml(side) {
  if (!side) return "—";
  const symbol = side?.body_glyph || "";
  const axisKeys = new Set(["asc", "dc", "mc", "ic"]);
  const bodyKey = String(side?.body_key || "").toLowerCase();
  const rawName = side?.body_ja || side?.body_key || "";
  const nameText = axisKeys.has(bodyKey) ? String(rawName).toUpperCase() : rawName;
  const axisPrefix = axisKeys.has(bodyKey) ? AXIS_SYMBOLS[bodyKey] : "";
  const name = axisPrefix ? `${axisPrefix} ${nameText}`.trim() : nameText;
  const sign = side?.sign_ja || side?.sign_key || "";
  const house = Number.isFinite(Number(side?.house)) ? `${side.house}H` : "";
  const bodyGlyph = symbol ? buildGlyphImgTag(symbol, { className: "glyph-img glyph-img--body", size: 26, color: "#EDEEFF" }) : "";
  const signGlyph = side?.sign_glyph ? buildGlyphImgTag(side.sign_glyph, { className: "glyph-img glyph-img--sign", size: 16, color: "#EDEEFF" }) : "";
  const bodyText = [name].filter(Boolean).join(" ").trim();
  const signText = [sign, house].filter(Boolean).join(" ").trim();
  return `
    <span class="connection-body">${bodyGlyph}<span class="connection-body-text">${escapeHtml(bodyText || "—")}</span></span>
    <span class="connection-sign">${signGlyph}<span class="connection-sign-text">${escapeHtml(signText || "—")}</span></span>
  `;
}

function formatAspectDisplay(aspectRaw, orbRaw) {
  const key = normalizeRelationAspectKey(aspectRaw);
  const meta = ASPECT_DISPLAY[key] || { symbol: "※", ja: "セプタイル系" };
  const orb = formatOrbValue(orbRaw);
  return { symbol: meta.symbol, label: meta.ja, orb: `${orb}°` };
}

function formatGapRow(gap) {
  if (!gap) return "";
  const pair = String(gap?.pair || "");
  const parts = pair.split("_");
  const a = formatBodyKeyShort(parts[0]);
  const b = formatBodyKeyShort(parts[1]);
  const aspect = gap?.aspect || "";
  const orb = Number.isFinite(Number(gap?.orb)) ? `${Number(gap.orb).toFixed(2)}°` : "";
  return `${a} × ${b}｜${aspect} ${orb}`.trim();
}

function formatHouseLinkRow(link) {
  if (!link) return "";
  const aHouse = Number.isFinite(Number(link?.a_house)) ? `${link.a_house}H` : "—";
  const bHouse = Number.isFinite(Number(link?.b_house)) ? `${link.b_house}H` : "—";
  const via = String(link?.via || "");
  const parts = via.split("_");
  const viaLabel = parts.length === 2 ? `${formatBodyKeyShort(parts[0])}×${formatBodyKeyShort(parts[1])}` : via;
  return `${aHouse} ↔ ${bHouse}｜${viaLabel}`.trim();
}

module.exports = {
  escapeHtml,
  formatPlanetRow,
  formatBodyKeyShort,
  formatElementKey,
  formatModalityKey,
  pickDominantElementKey,
  topTwoFromCounts,
  formatAspectLabel,
  shortName,
  normalizeAspectKey: normalizeRelationAspectKey,
  formatOrbValue,
  formatConnectionSideHtml,
  formatAspectDisplay,
  formatGapRow,
  formatHouseLinkRow,
};
