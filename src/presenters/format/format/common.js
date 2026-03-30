"use strict";

const {
  normalizeBodyKey,
  normalizeSignKey,
  normalizeAspectKey,
} = require("../../../domain/canonical");
const {
  bodyGlyph,
  signGlyph,
  signLabelJa,
} = require("../../shared/text/tokens");

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

function glyphForBody(key) {
  return bodyGlyph(key);
}

function glyphForSign(signKey) {
  return signGlyph(signKey);
}

function signJa(dict, signKey) {
  return signLabelJa(dict, signKey);
}

function aspectMetaFromDict(dict, key) {
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
    if (pool && pool[key]) return { meta: pool[key], group };
  }
  return null;
}

function aspectInfo(dict, rawType, aspectDeg) {
  const k = normalizeAspectKey(rawType, aspectDeg);
  let resolved = aspectMetaFromDict(dict, k);
  let meta = resolved?.meta || null;
  let group = resolved?.group || "unknown";

  if (!meta && Number.isFinite(Number(aspectDeg))) {
    const target = Number(aspectDeg);
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
    for (const { group: g, pool } of pools) {
      if (!pool) continue;
      for (const v of Object.values(pool)) {
        if (Number.isFinite(Number(v?.deg)) && Number(v.deg) === target) {
          meta = v;
          group = g;
          break;
        }
      }
      if (meta) break;
    }
  }

  return {
    label_ja: meta?.label_ja || "",
    deg: Number.isFinite(Number(meta?.deg)) ? Number(meta.deg) : null,
    key: meta?.key || k || "",
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
