"use strict";

/**
 * blend_fusion.js
 * - BLEND_V1.fusion があればそれを使う
 * - header は render 側の責務（ここでは扱わない）
 * - template 選択は安全第一（未定義でも絶対に落ちない）
 */

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function firstNonEmpty(...xs) {
  for (const x of xs) {
    const s = safeStr(x).trim();
    if (s) return s;
  }
  return "";
}

// ============================================================
// Sign / Planet helpers
// ============================================================
function getSignFieldJa({ BLEND_V1, SIGNS_V1 }, signKey) {
  const k = safeStr(signKey).toLowerCase();
  if (!k) return "その領域";

  // fusion 専用定義
  const field = BLEND_V1?.fusion?.sign_field_ja?.[k];
  if (field) return field;

  // fallback: sign core
  const core = SIGNS_V1?.signs?.[k]?.core;
  if (core) return core;

  return "その領域";
}

function getPlanetActionJa({ BLEND_V1, PLANETS_META, POINTS_META }, bodyKey) {
  const k = safeStr(bodyKey);
  if (!k) return "作用";

  const a = BLEND_V1?.fusion?.planet_action_ja?.[k];
  if (a) return a;

  // fallback: meta core
  const core =
    PLANETS_META?.[k]?.core ||
    POINTS_META?.[k]?.core ||
    null;

  if (core) return core;
  return "作用";
}

function getAspectDynamicsJa({ BLEND_V1 }, aspectLabelJa) {
  const k = safeStr(aspectLabelJa);
  if (!k) return "反応が出やすい";

  const d = BLEND_V1?.fusion?.aspect_dynamics_ja?.[k];
  if (d) return d;

  // fallback: legacy を短縮
  const legacy = BLEND_V1?.legacy?.aspect_sentence_by_label_ja?.[k];
  if (legacy) return legacy.replace(/。$/, "");

  return "反応が出やすい";
}

function getOrbHintJa({ BLEND_V1 }, orbDeg) {
  const n = Number(orbDeg);
  if (!Number.isFinite(n)) return "";

  const rules = BLEND_V1?.fusion?.orb_hint_ja || [];
  for (const r of rules) {
    if (n <= Number(r?.max)) return String(r?.text || "");
  }
  return "";
}

// ============================================================
// Fusion sentence builder (SSOT)
// ============================================================
function pickTemplate(fusion, mode) {
  if (!fusion) return "";

  // sky_* → sky_mini / sky_micro / sky
  if (mode === "sky_micro") {
    return fusion.template_sky_micro_ja
        || fusion.template_micro_ja
        || fusion.template_sky_ja
        || fusion.template_ja
        || "";
  }

  if (mode === "sky_mini") {
    return fusion.template_sky_mini_ja
        || fusion.template_mini_ja
        || fusion.template_sky_ja
        || fusion.template_ja
        || "";
  }

  if (mode === "micro") {
    return fusion.template_micro_ja
        || fusion.template_mini_ja
        || fusion.template_ja
        || "";
  }

  if (mode === "mini") {
    return fusion.template_mini_ja
        || fusion.template_ja
        || "";
  }

  // default
  return fusion.template_ja || "";
}

function buildFusionSentence(ctx, item, opts = {}) {
  const { BLEND_V1 } = ctx || {};
  if (!BLEND_V1?.fusion) return "";

  const mode = opts.template || "default";

  const natalBody = item?.natal?.body;
  const natalSign = item?.natal?.sign;

  const transitBody = item?.transit?.body;
  const transitSign = item?.transit?.sign;

  const aspectLabelJa = item?.aspect?.label_ja || "";
  const orb = item?.orb;

  const field_natal = getSignFieldJa(ctx, natalSign);
  const action_natal = getPlanetActionJa(ctx, natalBody);

  const field_transit = getSignFieldJa(ctx, transitSign);
  const action_transit = getPlanetActionJa(ctx, transitBody);

  const dynamics = getAspectDynamicsJa(ctx, aspectLabelJa);
  const orb_hint = getOrbHintJa(ctx, orb);

  const template = pickTemplate(BLEND_V1.fusion, mode);
  if (!template) return "";

  return template
    .replace("{field_natal}", firstNonEmpty(field_natal, "その領域"))
    .replace("{action_natal}", firstNonEmpty(action_natal, "作用"))
    .replace("{field_transit}", firstNonEmpty(field_transit, "その領域"))
    .replace("{action_transit}", firstNonEmpty(action_transit, "作用"))
    .replace("{dynamics}", firstNonEmpty(dynamics, "反応が出やすい"))
    .replace("{orb_hint}", orb_hint || "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { buildFusionSentence };
