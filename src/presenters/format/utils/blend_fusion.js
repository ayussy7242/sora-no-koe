"use strict";

/**
 * engine/blend_fusion.js (SSOT) — 2026.02.05 FIX
 *
 * ✅ FIX:
 * - dict/blend.v2 の buildFusionSentence(dictOrDeps, item, opts) に
 *   “モジュール自身(mod)” を渡していたバグを修正
 * - 正しく “依存辞書(ctx)” を第1引数に渡す（PLANETS_V2/SIGNS_V2/ASPECTS_V2 参照が復活）
 *
 * ✅ SSOT:
 * - dict/blend.v2 の buildFusionSentence を唯一入口として呼ぶ
 * - render 側は template/mode/seed だけ渡す
 */

let BLEND_V2_MOD = null;

function _safeRequire(path) {
  try { return require(path); } catch (_) { return null; }
}

BLEND_V2_MOD =
  _safeRequire("../../../content/dict/blend.v2") ||
  _safeRequire("../../../content/dict/blend.v2.js") ||
  _safeRequire("./blend.v2") ||
  _safeRequire("./blend.v2.js") ||
  null;

// ----------------------------
// utils
// ----------------------------
function safeStr(v) { return v == null ? "" : String(v); }
function trimStr(v) { return safeStr(v).trim(); }

// ----------------------------
// detect V2 (module must have both)
// ----------------------------
function hasV2(mod) {
  return !!(mod?.BLEND_V2 && typeof mod?.buildFusionSentence === "function");
}

// ============================================================
// fallback (never crash)
// ============================================================
function _v2FallbackSentence(_ctx, item, opts = {}) {
  const template = safeStr(opts.template || "default");
  const mode = safeStr(opts.mode || item?.kind || "");

  const isSky =
    mode === "sky" ||
    template.startsWith("sky_") ||
    item?.kind === "sky";

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
// Public API (SSOT)
// ============================================================
function buildFusionSentence(ctx, item, opts = {}) {
  const mod = BLEND_V2_MOD;

  if (!hasV2(mod)) return _v2FallbackSentence(ctx, item, opts);

  const template = safeStr(opts.template || "default");
  const mode = safeStr(opts.mode || item?.kind || "");
  const seed = safeStr(opts.seed || item?.seed || "");

  const fixedOpts = {
    ...opts,
    template,
    mode,
    seed,
  };

  try {
    // ✅ ここが修正点：第1引数は “依存辞書(ctx)” を渡す
    const out = mod.buildFusionSentence(ctx || {}, item, fixedOpts);
    return trimStr(out) ? String(out).trim() : _v2FallbackSentence(ctx, item, opts);
  } catch (_) {
    return _v2FallbackSentence(ctx, item, opts);
  }
}

module.exports = { buildFusionSentence };
