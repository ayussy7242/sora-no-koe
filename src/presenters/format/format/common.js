"use strict";

const {
  normalizeBodyKey,
  normalizeSignKey,
} = require("../../../domain/canonical");
const { normalizeAspectType, getAspectMeta } = require("../../../domain/aspect/canonical");
const { formatDateLabel } = require("../../../utils/time");
const {
  bodyGlyph,
  signGlyph,
  signLabelJa,
} = require("../../shared/text/tokens");

function glyphForBody(key) {
  return bodyGlyph(key);
}

function glyphForSign(signKey) {
  return signGlyph(signKey);
}

function signJa(dict, signKey) {
  return signLabelJa(dict, signKey);
}

function aspectInfo(dict, rawType, aspectDeg) {
  const normalized = normalizeAspectType(rawType, aspectDeg);
  const resolved = getAspectMeta(dict, rawType, aspectDeg);
  const meta = resolved?.meta || null;
  const group = resolved?.group || "unknown";

  return {
    label_ja: meta?.label_ja || "",
    deg: Number.isFinite(Number(meta?.deg)) ? Number(meta.deg) : null,
    key: meta?.key || resolved?.key || normalized || "",
    group,
    is_known_aspect: Boolean(meta && (meta?.label_ja || Number.isFinite(Number(meta?.deg)))),
  };
}

function formatAspectDisplay({
  dict,
  rawType,
  aspectDeg,
  orbDeg,
  degPrecision = 0,
  orbPrecision = 2,
  fallbackLabel = "",
} = {}) {
  const info = aspectInfo(dict, rawType, aspectDeg);
  const label =
    info?.label_ja ||
    String(fallbackLabel || rawType || "").trim();
  const deg = Number.isFinite(Number(info?.deg))
    ? Number(info.deg)
    : Number.isFinite(Number(aspectDeg))
      ? Number(aspectDeg)
      : null;
  const degText = deg != null
    ? `${degPrecision === 0 ? Math.round(deg) : deg.toFixed(degPrecision)}°`
    : "";
  const orb = Number.isFinite(Number(orbDeg)) ? Number(orbDeg) : null;
  const orbText = orb != null ? `${orb.toFixed(orbPrecision)}°` : "";
  const line = [label, degText].filter(Boolean).join(" ").trim();

  return {
    ...info,
    label,
    deg,
    degText,
    orb,
    orbText,
    line,
  };
}

function formatElementModalityLines(summary) {
  const element = summary?.element || summary?.element_count || {};
  const modality = summary?.modality || summary?.modality_count || {};
  const hasElement =
    Number(element.fire || 0) + Number(element.earth || 0) + Number(element.air || 0) + Number(element.water || 0) > 0;
  const hasModality =
    Number(modality.cardinal || 0) + Number(modality.fixed || 0) + Number(modality.mutable || 0) > 0;

  if (!hasElement && !hasModality) return [];

  return [
    `🔥火${Number(element.fire || 0)} 🪨地${Number(element.earth || 0)} 💨風${Number(element.air || 0)} 💧水${Number(element.water || 0)}`,
    `🏃活動${Number(modality.cardinal || 0)} 🧱不動${Number(modality.fixed || 0)} 🌿柔軟${Number(modality.mutable || 0)}`,
  ];
}

module.exports = {
  formatDateLabel,
  glyphForBody,
  glyphForSign,
  signJa,
  aspectInfo,
  formatAspectDisplay,
  formatElementModalityLines,
};
