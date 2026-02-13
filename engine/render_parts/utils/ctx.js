"use strict";

/**
 * ctx.js (v2-pref)
 * - ASPECTS/PLANETS/SIGNS: V2 があれば V2 → なければ V1 → 最後に fallback(META_IN)
 * - keys を lower normalize して fmt_ja 側の Sun/Pluto/ASC ゆれを根絶
 * - "deps" 変数などの事故を起こさない（このファイルは deps を一切参照しない）
 */

function lowerKeyed(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[String(k).toLowerCase()] = v;
  return out;
}

// --------------------
// META builders
// --------------------
function buildAspectsMetaFromV1(ASPECTS_V1) {
  const major = ASPECTS_V1?.major || {};
  const deep = ASPECTS_V1?.deep_space || {};
  const out = {};

  for (const [k, v] of Object.entries(major)) {
    out[k] = {
      label_ja: v?.label_ja || k,
      core: v?.core || null,
      sora: v?.sora || null,
      feel: Array.isArray(v?.feel) ? v.feel : [],
    };
  }

  for (const [k, v] of Object.entries(deep)) {
    if (!v || typeof v !== "object") continue;
    if (!("label_ja" in v) && !("core" in v) && !("sora" in v)) continue;
    out[k] = {
      label_ja: v?.label_ja || k,
      core: v?.core || null,
      sora: v?.sora || null,
      feel: Array.isArray(v?.feel) ? v.feel : [],
    };
  }

  // guard（最低限）
  out.square ||= { label_ja: "スクエア", core: null, sora: null, feel: [] };
  out.trine ||= { label_ja: "トライン", core: null, sora: null, feel: [] };
  out.opposition ||= { label_ja: "オポジション", core: null, sora: null, feel: [] };
  out.conjunction ||= { label_ja: "コンジャンクション", core: null, sora: null, feel: [] };
  out.sextile ||= { label_ja: "セクスタイル", core: null, sora: null, feel: [] };

  return out;
}

function buildAspectsMetaFromV2(ASPECTS_V2) {
  const out = {};

  // major / deep_space / minor など “全部拾う”
  for (const groupKey of Object.keys(ASPECTS_V2 || {})) {
    if (groupKey === "version" || groupKey === "order") continue;
    const group = ASPECTS_V2?.[groupKey];
    if (!group || typeof group !== "object") continue;

    for (const [k, v] of Object.entries(group)) {
      if (!v || typeof v !== "object") continue;

      out[k] = {
        label_ja: v?.label_ja || k,
        core: v?.core || null,
        sora: v?.sora || null,
        feel: Array.isArray(v?.feel) ? v.feel : [],
        angle_deg: Number.isFinite(Number(v?.angle_deg)) ? Number(v.angle_deg) : null,
        enabled_by_default: v?.enabled_by_default !== undefined ? !!v.enabled_by_default : true,
      };
    }
  }

  // guard（最低限）
  out.square ||= { label_ja: "スクエア", core: null, sora: null, feel: [] };
  out.trine ||= { label_ja: "トライン", core: null, sora: null, feel: [] };
  out.opposition ||= { label_ja: "オポジション", core: null, sora: null, feel: [] };
  out.conjunction ||= { label_ja: "コンジャンクション", core: null, sora: null, feel: [] };
  out.sextile ||= { label_ja: "セクスタイル", core: null, sora: null, feel: [] };

  return out;
}

function buildPlanetsMetaFromV1(PLANETS_V1) {
  const bodies = PLANETS_V1?.bodies || {};
  const out = {};
  for (const [k, v] of Object.entries(bodies)) {
    out[k] = {
      label_ja: v?.label_ja || k,
      core: v?.core || null,
      sora_short: v?.sora_short || null,
      sora: v?.sora || null,
      field: v?.field || null,
    };
  }
  return out;
}

function buildPlanetsMetaFromV2(PLANETS_V2) {
  const bodies = PLANETS_V2?.bodies || {};
  const out = {};
  for (const [k, v] of Object.entries(bodies)) {
    out[k] = {
      label_ja: v?.label_ja || k,
      core: v?.core || null,
      sora_short: v?.sora_short || null,
      sora: v?.sora || null,
      field: v?.field || null,

      // v2 extras（必要なら使う）
      role: v?.role || null,
      verbs: Array.isArray(v?.verbs) ? v.verbs : [],
      texture: Array.isArray(v?.texture) ? v.texture : [],
      tendency_key: v?.tendency_key || null,
      keywords: Array.isArray(v?.keywords) ? v.keywords : [],
      ai_tags: Array.isArray(v?.ai_tags) ? v.ai_tags : [],
    };
  }
  return out;
}

function buildSignsMetaFromV1(SIGNS_V1) {
  const signs = SIGNS_V1?.signs || SIGNS_V1 || {};
  const out = {};
  for (const [k, v] of Object.entries(signs)) {
    out[k] = {
      label_ja: v?.label_ja || v?.label || k,
      element: v?.element || null,
      modality: v?.modality || null,
    };
  }
  return out;
}

function buildSignsMetaFromV2(SIGNS_V2) {
  const signs = SIGNS_V2?.signs || {};
  const out = {};
  for (const [k, v] of Object.entries(signs)) {
    out[k] = {
      label_ja: v?.label_ja || k,
      element: v?.element || null,
      modality: v?.modality || null,
      core: v?.core || null,
      tone: v?.tone || null,
      sora_short: v?.sora_short || null,
      sora: v?.sora || null,
      keywords: Array.isArray(v?.keywords) ? v.keywords : [],
      ai_tags: Array.isArray(v?.ai_tags) ? v.ai_tags : [],

      // v2 extras
      flavor: v?.flavor || null,
      texture: Array.isArray(v?.texture) ? v.texture : [],
      verbs: Array.isArray(v?.verbs) ? v.verbs : [],
      tendency_key: v?.tendency_key || null,
    };
  }
  return out;
}

function buildPointsMetaFromV1(POINTS_V1) {
  const points = POINTS_V1?.points || {};
  const out = {};
  for (const [k, v] of Object.entries(points)) {
    out[k] = {
      label_ja: v?.label_ja || k,
      core: v?.core || null,
      sora_short: v?.sora_short || null,
      sora: v?.sora || null,
      field: v?.field || null,
      keywords: Array.isArray(v?.keywords) ? v.keywords : [],
      ai_tags: Array.isArray(v?.ai_tags) ? v.ai_tags : [],
    };
  }
  return out;
}

// --------------------
// main
// --------------------
function buildRenderCtx({
  dict = null,
  ASPECTS_META_IN = null,
  PLANETS_META_IN = null,
  POINTS_META_IN = null,
  SIGNS_META_IN = null,
} = {}) {
  // primary (V2 preferred)
  const ASPECTS_RAW = dict?.ASPECTS || dict?.ASPECTS_V2 || dict?.ASPECTS_V1 || null;
  const PLANETS_RAW = dict?.PLANETS || dict?.PLANETS_V2 || dict?.PLANETS_V1 || null;
  const SIGNS_RAW = dict?.SIGNS || dict?.SIGNS_V2 || dict?.SIGNS_V1 || null;

  const ASPECTS_IS_V2 = String(ASPECTS_RAW?.version || "").includes("v2");
  const PLANETS_IS_V2 = String(PLANETS_RAW?.version || "").includes("v2");
  const SIGNS_IS_V2 = String(SIGNS_RAW?.version || "").includes("v2");

  // V1/V2 buckets (for compatibility)
  const ASPECTS_V2 = ASPECTS_IS_V2 ? ASPECTS_RAW : dict?.ASPECTS_V2 || null;
  const ASPECTS_V1 = !ASPECTS_IS_V2 ? ASPECTS_RAW : dict?.ASPECTS_V1 || null;
  const PLANETS_V2 = PLANETS_IS_V2 ? PLANETS_RAW : dict?.PLANETS_V2 || null;
  const PLANETS_V1 = !PLANETS_IS_V2 ? PLANETS_RAW : dict?.PLANETS_V1 || null;
  const SIGNS_V2 = SIGNS_IS_V2 ? SIGNS_RAW : dict?.SIGNS_V2 || null;
  const SIGNS_V1 = !SIGNS_IS_V2 ? SIGNS_RAW : dict?.SIGNS_V1 || null;

  const POINTS_V1 = dict?.POINTS_V1 || null;
  const BLEND_V1 = dict?.BLEND_V1 || null;
  const BLEND_V2 = dict?.BLEND_V2 || null;

  const SIGN_FLAVOR_V1 = dict?.SIGN_FLAVOR_V1 || dict?.sign_flavor || null;
  const GRAMmars_V1 = dict?.GRAMmars_V1 || dict?.grammars || null;

  // fallbacks
  const ASPECTS_META_FALLBACK = dict?.ASPECTS_META || ASPECTS_META_IN || {};
  const PLANETS_META_FALLBACK = dict?.PLANETS_META || PLANETS_META_IN || {};
  const POINTS_META_FALLBACK = dict?.POINTS_META || POINTS_META_IN || {};
  const SIGNS_META_FALLBACK = dict?.SIGNS_META || SIGNS_META_IN || {};

  // ✅ v2 pref（RAW）
  const ASPECTS_META_RAW =
    (ASPECTS_V2 ? buildAspectsMetaFromV2(ASPECTS_V2) : null) ||
    (ASPECTS_V1 ? buildAspectsMetaFromV1(ASPECTS_V1) : null) ||
    ASPECTS_META_FALLBACK;

  const PLANETS_META_RAW =
    (PLANETS_RAW ? buildPlanetsMetaFromV2(PLANETS_RAW) : null) ||
    (PLANETS_V1 ? buildPlanetsMetaFromV1(PLANETS_V1) : null) ||
    PLANETS_META_FALLBACK;

  const POINTS_META_RAW =
    (POINTS_V1 ? buildPointsMetaFromV1(POINTS_V1) : null) ||
    POINTS_META_FALLBACK;

  const SIGNS_META_RAW =
    (SIGNS_RAW ? buildSignsMetaFromV2(SIGNS_RAW) : null) ||
    (SIGNS_V1 ? buildSignsMetaFromV1(SIGNS_V1) : null) ||
    SIGNS_META_FALLBACK;

  // ✅ lower normalize（全METAを lower key に統一）
  const ASPECTS_META = lowerKeyed(ASPECTS_META_RAW);
  const PLANETS_META = lowerKeyed(PLANETS_META_RAW);
  const POINTS_META = lowerKeyed(POINTS_META_RAW);
  const SIGNS_META = lowerKeyed(SIGNS_META_RAW);

  // ✅ FUSION ctx（ここで確定：blend_fusion / fmt_ja などの SSOT）
  const FUSION_CTX = {
    // dicts
    BLEND_V1,
    BLEND_V2,
    SIGNS_V1,
    SIGNS_V2,
    ASPECTS_V2,
    PLANETS_V2,
    SIGN_FLAVOR_V1,
    GRAMmars_V1,

    // meta
    ASPECTS_META,
    PLANETS_META,
    POINTS_META,
    SIGNS_META,
  };

  return {
    dictV1: { ASPECTS_V1, PLANETS_V1, POINTS_V1, SIGNS_V1, BLEND_V1 },
    dictV2: { ASPECTS_V2, SIGNS_V2, PLANETS_V2, BLEND_V2 },
    dictMetaIn: { ASPECTS_META_FALLBACK, PLANETS_META_FALLBACK, POINTS_META_FALLBACK, SIGNS_META_FALLBACK },
    META: { ASPECTS_META, PLANETS_META, POINTS_META, SIGNS_META },
    FUSION_CTX,
  };
}

module.exports = {
  buildRenderCtx,
  buildAspectsMetaFromV1,
  buildAspectsMetaFromV2,
  buildPlanetsMetaFromV1,
  buildPlanetsMetaFromV2,
  buildPointsMetaFromV1,
  buildSignsMetaFromV1,
  buildSignsMetaFromV2,
};
