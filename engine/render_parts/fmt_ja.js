"use strict";

/**
 * fmt_ja.js
 * - 天体/感受点/アスペクトの日本語ラベル化（META優先）
 * - point優先 → planet
 * - 大小文字ゆれ（Sun/Pluto/ASC）を吸収
 */

const SAFE_POINT_JA = Object.freeze({
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dsc: "DSC",
});

const SAFE_PLANET_JA = Object.freeze({
  sun: "太陽",
  moon: "月",
  mercury: "水星",
  venus: "金星",
  mars: "火星",
  jupiter: "木星",
  saturn: "土星",
  uranus: "天王星",
  neptune: "海王星",
  pluto: "冥王星",
  chiron: "キロン",
});

function createJaFormatters({
  BODY_JA = {},
  POINT_JA = {},
  ASPECT_JA = {},
  META = {},
  // ✅ ここ超重要：ASPECT key も lower で統一
  normalizeAspectType = (x) => String(x || "").trim().toLowerCase(),
} = {}) {
  const { ASPECTS_META = {}, PLANETS_META = {}, POINTS_META = {} } = META || {};

  const _memo = {
    aspectJa: new Map(),
    coreOf: new Map(),
    aspectCore: new Map(),
  };

  // --------------------
  // fmtDeg
  // --------------------
  function fmtDeg(x, digits = 1) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "—";
    const d = Math.max(0, Math.min(3, Number(digits) || 0));
    const v = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
    if (d === 0) return String(Math.round(v));
    const s = v.toFixed(d);
    return s === "-0.0" ? "0.0" : s;
  }

  // --------------------
  // labels
  // --------------------
  function fmtAspectJa(aspectType) {
    const k = normalizeAspectType(aspectType);
    if (_memo.aspectJa.has(k)) return _memo.aspectJa.get(k);

    const v = ASPECTS_META?.[k]?.label_ja || ASPECT_JA?.[k] || k;
    _memo.aspectJa.set(k, v);
    return v;
  }

  function fmtBodyJa(key) {
    const raw = String(key || "").trim();
    if (!raw) return "";

    const low = raw.toLowerCase();

    // META（lower想定）
    const meta = PLANETS_META?.[low];
    if (meta?.label_ja) return meta.label_ja;

    // SAFE 最終保険
    if (SAFE_PLANET_JA[low]) return SAFE_PLANET_JA[low];

    // 互換MAP（raw/low 両対応）
    if (BODY_JA?.[raw]) return BODY_JA[raw];
    if (BODY_JA?.[low]) return BODY_JA[low];

    return raw;
  }

  function fmtPointJa(key) {
    const raw = String(key || "").trim();
    if (!raw) return "";

    const low = raw.toLowerCase();

    // ✅ 見やすい点ラベル（ASC/MC…）
    const safe = SAFE_POINT_JA[low];

    // META（lower想定）
    const meta = POINTS_META?.[low];
    if (meta?.label_ja) {
      // meta.label_ja が生値（asc）っぽい時は SAFE を優先
      if (safe && String(meta.label_ja).toLowerCase() === low) return safe;
      return meta.label_ja;
    }

    // 互換MAP（raw/low）
    if (POINT_JA?.[raw]) return POINT_JA[raw];
    if (POINT_JA?.[low]) return POINT_JA[low];

    // SAFE 最終保険
    if (safe) return safe;

    return raw;
  }

  function fmtAnyJa(key) {
    const raw = String(key || "");
    const low = raw.toLowerCase();

    // point優先
    const p = fmtPointJa(raw);
    if (p && p !== raw) return p;

    return fmtBodyJa(raw);
  }

  // --------------------
  // cores
  // --------------------
  function coreOf(key) {
    const raw = String(key || "");
    if (_memo.coreOf.has(raw)) return _memo.coreOf.get(raw);

    const low = raw.toLowerCase();

    const v =
      PLANETS_META?.[low]?.core ||
      POINTS_META?.[low]?.core ||
      null;

    _memo.coreOf.set(raw, v);
    return v;
  }

  function aspectCore(type) {
    const k = normalizeAspectType(type);
    if (_memo.aspectCore.has(k)) return _memo.aspectCore.get(k);

    const v = ASPECTS_META?.[k]?.core || null;
    _memo.aspectCore.set(k, v);
    return v;
  }

  return {
    fmtAspectJa,
    fmtBodyJa,
    fmtPointJa,
    fmtAnyJa,
    coreOf,
    aspectCore,
    fmtDeg,
    _memo,
    SAFE_POINT_JA,
  };
}

module.exports = { createJaFormatters };
