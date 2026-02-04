"use strict";

/**
 * engine/blend_fusion.js (SSOT / V2-ONLY + deps-safe) — 2026.01 (PATCHED)
 *
 * ✅ SSOT:
 * - dict/blend.v2 の buildFusionSentence を “唯一入口” として呼ぶ
 * - render 側は template/mode だけ渡す
 */

let BLEND_V2_MOD = null;

function _safeRequire(path) {
  try { return require(path); } catch (_) { return null; }
}

BLEND_V2_MOD =
  _safeRequire("../dict/blend.v2") ||
  _safeRequire("../dict/blend.v2.js") ||
  _safeRequire("./blend.v2") ||
  _safeRequire("./blend.v2.js") ||
  null;
  
// ----------------------------
// utils
// ----------------------------
function safeStr(v) { return v == null ? "" : String(v); }
function trimStr(v) { return safeStr(v).trim(); }

// ----------------------------
// detect V2
// ----------------------------
function hasV2(ctx) {
  const mod = ctx || BLEND_V2_MOD;
  return !!(mod?.BLEND_V2 && typeof mod?.buildFusionSentence === "function");
}

// ============================================================
// fallback (never crash)
// ============================================================
function _v2FallbackSentence(ctx, item, opts = {}) {
  const template = safeStr(opts.template || "default");
  const mode = safeStr(opts.mode || item?.kind || "");

  const isSky = mode === "sky" || template.startsWith("sky_") || item?.kind === "sky";

  if (isSky) {
    const a = safeStr(item?.a || item?.aPlanetKey || "?");
    const b = safeStr(item?.b || item?.bPlanetKey || "?");
    return `${a}×${b}｜触れやすい配置。`;
  }
  const n = safeStr(item?.natal?.body || item?.natalPlanetKey || "?");
  const t = safeStr(item?.transit?.body || item?.transitPlanetKey || "?");
  return `${n}×${t}｜触れやすい配置。`;
}

// ============================================================
// Public API (SSOT) — V2 ONLY
// ============================================================
function buildFusionSentence(ctx, item, opts = {}) {
  const mod = (ctx && ctx.BLEND_V2) ? ctx.BLEND_V2 : (ctx || BLEND_V2_MOD);
  if (!hasV2(mod)) return _v2FallbackSentence(mod, item, opts);

  const template = safeStr(opts.template || "default");
  const mode = safeStr(opts.mode || item?.kind || "");
  const seed = safeStr(opts.seed || item?.seed || "");

  // aspectType 正規化だけこちらで担保（V2側にも入れてあるなら不要だけど保険）
  const fixedOpts = {
    ...opts,
    template,
    mode,
    seed,
  };

  try {
    const out = mod.buildFusionSentence(mod, item, fixedOpts);
    return trimStr(out) ? String(out).trim() : _v2FallbackSentence(mod, item, opts);
  } catch (_) {
    return _v2FallbackSentence(mod, item, opts);
  }
}

module.exports = { buildFusionSentence };
