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
  const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space, v1.craft_space];
  for (const p of pools) {
    if (p && p[key]) return p[key];
  }
  return null;
}

function aspectInfo(dict, rawType, aspectDeg) {
  const k = normalizeAspectKey(rawType, aspectDeg);
  let meta = aspectMetaFromDict(dict, k);

  if (!meta && Number.isFinite(Number(aspectDeg))) {
    const target = Number(aspectDeg);
    const v2 = dict?.ASPECTS_V2 || {};
    const v1 = dict?.ASPECTS_V1 || {};
    const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space, v1.craft_space];
    for (const p of pools) {
      if (!p) continue;
      for (const v of Object.values(p)) {
        if (Number.isFinite(Number(v?.deg)) && Number(v.deg) === target) {
          meta = v;
          break;
        }
      }
      if (meta) break;
    }
  }

  return {
    label_ja: meta?.label_ja || "",
    deg: Number.isFinite(Number(meta?.deg)) ? Number(meta.deg) : null,
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
    `🔥 火${Number(element.fire || 0)} 🪨 地${Number(element.earth || 0)} 💨 風${Number(element.air || 0)} 💧 水${Number(element.water || 0)}`,
    `🏃 活動${Number(modality.cardinal || 0)} 🧱 不動${Number(modality.fixed || 0)} 🌿 柔軟${Number(modality.mutable || 0)}`,
  ];
}

module.exports = {
  formatDateLabel,
  glyphForBody,
  glyphForSign,
  signJa,
  aspectInfo,
  formatElementModalityLines,
};
