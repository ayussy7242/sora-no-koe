"use strict";

/**
 * Resonance Engine v1 (FREE core)
 * - dict/resonance.v1 を参照
 * - 無料：moon sign / sky top aspect / personal touch まで
 *
 * Goals:
 * - dict の形が「配列」でも「{lines:[...]}」でも壊れない
 * - moon のキーは sign_ja(JA) 優先（辞書が「牡羊座」キーだから）
 * - personal の有無で theme が変わる（Venus/Mars/Sun は natal側も見る）
 * - 例外で落とさず、bullets は必ず配列で返す
 */

const path = require("path");
const { RESONANCE_V1 } = require(path.join(__dirname, "..", "dict", "resonance.v1"));
const { getUserId } = require("./render_parts/seed"); 

// --------------------
// stable random (seeded)
// --------------------
function hash32(str) {
  let h = 0x811c9dc5; // FNV-1a 32bit
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, seedStr) {
  const a = [...arr];
  const rng = mulberry32(hash32(seedStr));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickSeeded(arr, n, seedStr) {
  return shuffleSeeded(arr, seedStr).slice(0, Math.min(n, arr.length));
}

// --------------------
// helpers
// --------------------
function asArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;

  // common shapes: { lines:[...] } / { bullets:[...] } / { list:[...] } / { items:[...] } / { values:[...] }
  if (typeof v === "object") {
    for (const k of ["lines", "bullets", "list", "items", "values"]) {
      if (Array.isArray(v[k])) return v[k];
    }
  }

  if (typeof v === "string") return [v];
  return [];
}

function firstNonEmptyArray(...cands) {
  for (const c of cands) {
    const a = asArray(c);
    if (a.length) return a;
  }
  return [];
}

function toBulletLine(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  return t.startsWith("・") ? t : `・${t}`;
}

// --------------------
// theme detection（個人差の核）
// --------------------
function detectThemeFromTouchPoints(touchTop3 = []) {
  const has = (cond) => touchTop3.some(cond);

  // ASC があれば最優先
  if (has((t) => t?.natal_body_or_point === "ASC")) return "self_position";

  // 月：内側
  if (has((t) => t?.transit_body === "Moon" || t?.natal_body_or_point === "Moon")) return "emotion_inner";

  // Venus/Mars/Sun：transit or natal どっちに居ても拾う
  if (has((t) => t?.transit_body === "Venus" || t?.natal_body_or_point === "Venus")) return "relational_soft";
  if (has((t) => t?.transit_body === "Mars" || t?.natal_body_or_point === "Mars")) return "action_impulse";
  if (has((t) => t?.transit_body === "Sun" || t?.natal_body_or_point === "Sun")) return "core_light";

  return "emotion_inner";
}

// --------------------
// main builder
// --------------------
function buildResonanceBullets(story, opts = {}) {
  const { max = 4, allowPersonal = true, seed = null, debug = false } = opts;

  try {
    const dict = RESONANCE_V1 || {};
    const baseSets = dict.base_sets || {};

    // ✅ moon key（辞書がJAキーなので sign_ja 優先が正解）
    const moonSignKey = story?.public?.moon?.sign_key || null; // "Aries"
    const moonSignJa  = story?.public?.moon?.sign_ja  || null; // "牡羊座"
    const moonKeyForDict = moonSignJa || moonSignKey;          // ← ここが最新版ポイント

    const skyTop = asArray(story?.public?.sky_top);
    const touchTop3 = allowPersonal ? asArray(story?.personal?.touch_points_top3) : [];

    const themeKey = detectThemeFromTouchPoints(touchTop3);

    // base set（dict形が何でも壊れない）
    const baseSet = asArray(baseSets?.[themeKey]?.lines);

    // sky aspect flavor（{lines:[...]} もOK）
    const topAspectType = skyTop?.[0]?.type || null;
    const aspectFlavor = topAspectType ? asArray(dict?.aspect_flavor?.[topAspectType]) : [];

    // moon sign flavor（JA優先、ダメならEN）
    const moonFlavor = moonKeyForDict
      ? firstNonEmptyArray(
          dict?.moon_sign_flavor?.[moonSignJa],   // ← まず「牡羊座」
          dict?.moon_sign_flavor?.[moonSignKey]   // ← 次に "Aries"（将来対応用）
        )
      : [];

    // pool（絶対に配列だけ展開）
    const pool = [...baseSet, ...aspectFlavor, ...moonFlavor]
      .map(toBulletLine)
      .filter(Boolean);

    const dateLocal = story?.meta?.date_local || story?.public?.date_local || "unknown-date";
    const userId = getUserId(story);
    const seedStr =
      seed || `${dateLocal}:${userId}:${themeKey}:${topAspectType || "none"}:${moonKeyForDict || "none"}`;

    const bullets = pickSeeded(pool, max, seedStr);

    if (debug) {
      console.log("[reso] themeKey=", themeKey);
      console.log("[reso] baseSetLen=", baseSet.length);
      console.log("[reso] topAspectType=", topAspectType, "aspectFlavorLen=", aspectFlavor.length);
      console.log("[reso] moonKeyForDict=", moonKeyForDict, "moonFlavorLen=", moonFlavor.length);
      console.log("[reso] poolLen=", pool.length, "pickedLen=", bullets.length);
    }

    return {
      theme: themeKey,
      moon_sign: { key: moonSignKey, ja: moonSignJa },
      top_aspect: topAspectType,
      bullets: Array.isArray(bullets) ? bullets : [],
    };
  } catch (e) {
    // resonance は付加要素。落とさない。
    return {
      theme: "emotion_inner",
      moon_sign: { key: null, ja: null },
      top_aspect: null,
      bullets: [],
      error: e?.message || String(e),
    };
  }
}

module.exports = { buildResonanceBullets };
