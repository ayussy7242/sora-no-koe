"use strict";

/**
 * Resonance Engine v1 (FREE core) — Unified + FIX (v2026.01)
 *
 * ✅ What this file does
 * 1) buildResonanceBullets(story): 無料の「余韻 bullets」生成（既存ロジック維持＋重複なし）
 * 2) elementModalityFromSky(story): 「空層：要素×モード」を “その日の天体サイン” から集計（偏りFIX）
 * 3) buildSkyLayerLine(story, centerFlavorLabelJa): 空層1行テキスト生成（moon差分入りで日替わりを確実に）
 *
 * ✅ FIX: 「地×不動が毎回」対策
 * - 空層は "アスペクト" ではなく "その日の天体サイン" を集計して決める
 * - 同点は 月(moon) をタイブレークにする（最低でも日替わり）
 * - それでも同点は date_local seed で決める（固定化しない）
 *
 * Design:
 * - 断定しない / 指示しない / 煽らない
 * - 例外で落とさない（付加要素）
 */

const path = require("path");
const { RESONANCE_V1 } = require(path.join(__dirname, "..", "dict", "resonance.v1"));

// ✅ seed SSOT
const { hash32, pickStable, getUserId } = require("./render_parts/utils/seed");

// optional (if exists)
let SIGNS_V1 = null;
try {
  SIGNS_V1 = require(path.join(__dirname, "..", "dict", "signs.v1"))?.SIGNS_V1 || null;
} catch {
  SIGNS_V1 = null;
}

// --------------------
// helpers
// --------------------
function asArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;

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

function normalizeJa(s) {
  return String(s || "").trim();
}

function safeStr(v, fallback = "") {
  const t = String(v ?? "").trim();
  return t ? t : fallback;
}

// ✅ pickStable だけで「重複なし」を作る（決定論）
function pickStableManyUnique(pool, n, seedBase) {
  const src = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!src.length || n <= 0) return [];

  const remaining = [...src];
  const out = [];
  const limit = Math.min(n, remaining.length);

  for (let i = 0; i < limit; i++) {
    const picked = pickStable(remaining, `${seedBase}|i=${i}`);
    if (!picked) break;

    out.push(picked);

    const idx = remaining.indexOf(picked);
    if (idx >= 0) remaining.splice(idx, 1);
    if (!remaining.length) break;
  }

  return out;
}

// --------------------
// theme detection（個人差の核）
// --------------------
function detectThemeFromTouchPoints(touchTop3 = []) {
  const has = (cond) => touchTop3.some(cond);

  if (has((t) => t?.natal_body_or_point === "asc")) return "self_position";

  if (has((t) => t?.transit_body === "moon" || t?.natal_body_or_point === "moon"))
    return "emotion_inner";

  if (has((t) => t?.transit_body === "venus" || t?.natal_body_or_point === "venus"))
    return "relational_soft";
  if (has((t) => t?.transit_body === "mars" || t?.natal_body_or_point === "mars"))
    return "action_impulse";
  if (has((t) => t?.transit_body === "sun" || t?.natal_body_or_point === "sun"))
    return "core_light";

  return "emotion_inner";
}

// --------------------
// (NEW) sign → element/modality resolver
// --------------------

// fallback map（SIGNS_V1 が壊れても死なない保険）
const SIGN_TO_ELEMENT_MODALITY_JA = Object.freeze({
  "牡羊座": { element_ja: "火", modality_ja: "活動" },
  "牡牛座": { element_ja: "地", modality_ja: "不動" },
  "双子座": { element_ja: "風", modality_ja: "柔軟" },
  "蟹座": { element_ja: "水", modality_ja: "活動" },
  "獅子座": { element_ja: "火", modality_ja: "不動" },
  "乙女座": { element_ja: "地", modality_ja: "柔軟" },
  "天秤座": { element_ja: "風", modality_ja: "活動" },
  "蠍座": { element_ja: "水", modality_ja: "不動" },
  "射手座": { element_ja: "火", modality_ja: "柔軟" },
  "山羊座": { element_ja: "地", modality_ja: "活動" },
  "水瓶座": { element_ja: "風", modality_ja: "不動" },
  "魚座": { element_ja: "水", modality_ja: "柔軟" },
});

function signInfoFromJa(signJa) {
  const ja = normalizeJa(signJa);
  if (!ja) return null;

  // 1) SIGNS_V1 があるなら優先（構造の揺れを吸収）
  try {
    const byJa = SIGNS_V1?.by_ja || SIGNS_V1?.byJa || null;
    if (byJa?.[ja]) return byJa[ja];

    const list = SIGNS_V1?.list || SIGNS_V1?.signs || null;
    if (Array.isArray(list)) {
      const hit = list.find((s) => s?.ja === ja || s?.label_ja === ja || s?.name_ja === ja);
      if (hit) return hit;
    }
  } catch {
    // ignore
  }

  // 2) fallback
  if (SIGN_TO_ELEMENT_MODALITY_JA[ja]) return SIGN_TO_ELEMENT_MODALITY_JA[ja];

  return null;
}

// story から「その日の天体サイン（JA）」を拾う（構造差を吸収）
function pickSkySignList(story) {
  const ts = story?.public?.transit_signs;
  if (ts && typeof ts === "object") {
    const planets = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
    const out = [];
    for (const p of planets) {
      const hit = ts[p];
      const signJa = hit?.sign_ja || null;
      if (signJa) out.push({ planet: p, sign_ja: String(signJa) });
    }
    if (out.length) return out;
  }

  const candidates = [
    story?.public?.sky_positions,
    story?.public?.skyPositions,
    story?.public?.sky_all?.positions,
    story?.public?.sky_all?.bodies,
    story?.public?.sky?.positions,
    story?.sky?.positions,
    story?.public?.planets,
    story?.public?.bodies,
  ];

  let positions = null;
  for (const c of candidates) {
    if (c && typeof c === "object") {
      positions = c;
      break;
    }
  }
  if (!positions) return [];

  const planets = [
    "sun", "moon", "mercury", "venus", "mars",
    "jupiter", "saturn", "uranus", "neptune", "pluto",
  ];

  const out = [];

  for (const p of planets) {
    const pos =
      positions[p] ||
      positions[p.toLowerCase()] ||
      positions[p.replace(/([A-Z])/g, "_$1").toLowerCase()] ||
      null;

    const signJa = pos?.sign_ja || pos?.signJa || pos?.sign_ja_name || pos?.sign_name_ja || null;
    if (signJa) out.push({ planet: p, sign_ja: String(signJa) });
  }

  // 最低保障：moon が取れなかったら story.public.moon から拾う
  if (!out.some((x) => x.planet === "moon")) {
    const moonJa = story?.public?.moon?.sign_ja || null;
    if (moonJa) out.push({ planet: "moon", sign_ja: String(moonJa) });
  }

  return out;
}

// vote: 同点は moon を優先、それでも同点は date seed で決める（固定化しない）
function voteDominant(items, getKey, tieBreakerKey, tieSeedStr) {
  const counts = new Map();
  for (const it of items) {
    const k = getKey(it);
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (!counts.size) return null;

  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const bestN = entries[0][1];
  const tied = entries.filter(([, n]) => n === bestN).map(([k]) => k);

  if (tied.length === 1) return tied[0];

  if (tieBreakerKey && tied.includes(tieBreakerKey)) return tieBreakerKey;

  // それでも同点：date_local seed で決める（＝毎回同じキーになりにくい）
  const idx = hash32(`${tieSeedStr}|tied=${tied.join(",")}`) % tied.length;
  return tied[idx];
}

/**
 * ✅ 空層：要素×モード を “その日の天体サイン” から決める
 */
function elementModalityFromSky(story, opts = {}) {
  const { debug = false } = opts;

  try {
    const dateLocal = story?.meta?.date_local || story?.public?.date_local || "unknown-date";
    const userId = getUserId(story);
    const tieSeedStr = `${dateLocal}|${userId}|sky_layer_vote`;

    const signList = pickSkySignList(story);
    if (!signList.length) {
      return { element: null, modality: null, debug: debug ? { reason: "no_signs" } : undefined };
    }

    const enriched = signList
      .map((it) => {
        const info = signInfoFromJa(it.sign_ja);
        const element_ja =
          info?.element_ja || info?.element || SIGN_TO_ELEMENT_MODALITY_JA[it.sign_ja]?.element_ja || null;
        const modality_ja =
          info?.modality_ja || info?.modality || SIGN_TO_ELEMENT_MODALITY_JA[it.sign_ja]?.modality_ja || null;
        return { ...it, element_ja, modality_ja };
      })
      .filter((x) => x.element_ja && x.modality_ja);

    if (!enriched.length) {
      return { element: null, modality: null, debug: debug ? { reason: "no_enriched" } : undefined };
    }

    const moon = enriched.find((x) => x.planet === "moon") || null;
    const tieEl = moon?.element_ja || null;
    const tieMo = moon?.modality_ja || null;

    const element = voteDominant(enriched, (x) => x.element_ja, tieEl, `${tieSeedStr}|element`);
    const modality = voteDominant(enriched, (x) => x.modality_ja, tieMo, `${tieSeedStr}|modality`);

    const dbg = debug
      ? {
        date_local: dateLocal,
        user_id: userId,
        total: enriched.length,
        moon_sign: moon?.sign_ja || null,
        moon_element: tieEl,
        moon_modality: tieMo,
        sample: enriched.slice(0, 6),
      }
      : undefined;

    return { element, modality, debug: dbg };
  } catch (e) {
    return {
      element: null,
      modality: null,
      debug: debug ? { reason: "exception", error: e?.message || String(e) } : undefined,
    };
  }
}

/**
 * ✅ 空層テキストを組む（“毎回同じ”を防ぐため、必ず月サイン差分を入れる）
 * - centerFlavorLabelJa は「中心の質感」(ex: "チャンス・協力・選択肢") を渡す想定
 */
function buildSkyLayerLine(story, centerFlavorLabelJa, opts = {}) {
  const { includemoonHint = true } = opts;

  const { element, modality } = elementModalityFromSky(story, { debug: false });

  const em = element && modality ? `${element}×${modality}` : "（未集計）";
  const center = centerFlavorLabelJa ? `中心は「${centerFlavorLabelJa}」` : "中心は（未設定）";

  // moon hint（無料でも日替わり差分が出る）
  let moonHint = "";
  if (includemoonHint) {
    const moonSignJa = story?.public?.moon?.sign_ja || null;
    const moonLines =
      moonSignJa && RESONANCE_V1?.moon_sign_flavor?.[moonSignJa]
        ? asArray(RESONANCE_V1.moon_sign_flavor[moonSignJa])
        : [];
    if (moonSignJa && moonLines.length) {
      const one = String(moonLines[0]).replace(/^・/, "").trim();
      if (one) moonHint = `｜月${moonSignJa}：${one}`;
    }
  }

  return `空層：${em}。${center}${moonHint}`;
}

// --------------------
// main builder (FREE resonance bullets)
// --------------------
function buildResonanceBullets(story, opts = {}) {
  const { max = 4, allowPersonal = true, seed = null, debug = false } = opts;

  try {
    const dict = RESONANCE_V1 || {};
    const baseSets = dict.base_sets || {};

    // ✅ moon key（辞書がJAキーなので sign_ja 優先）
    const moonSignKey = story?.public?.moon?.sign_key || null; // "Aries" etc
    const moonSignJa = story?.public?.moon?.sign_ja || null;   // "牡羊座"
    const moonKeyForDict = moonSignJa || moonSignKey || null;

    const skyTop = asArray(story?.public?.sky_top);
    const touchTop3 = allowPersonal ? asArray(story?.personal?.touch_points_top3) : [];

    const themeKey = detectThemeFromTouchPoints(touchTop3);

    // base set（dict形が何でも壊れない）
    const baseSet = asArray(baseSets?.[themeKey]?.lines);

    // sky aspect flavor（dictが {lines:[]} でも [...] でもOK）
    const topAspectType = skyTop?.[0]?.type || null;
    const aspectFlavor = topAspectType
      ? firstNonEmptyArray(
        dict?.aspect_flavor?.[topAspectType]?.lines,
        dict?.aspect_flavor?.[topAspectType]
      )
      : [];

    // moon sign flavor（JA優先、ダメならEN）
    const moonFlavor = moonKeyForDict
      ? firstNonEmptyArray(
        dict?.moon_sign_flavor?.[moonSignJa],
        dict?.moon_sign_flavor?.[moonSignKey]
      )
      : [];

    const pool = [...baseSet, ...aspectFlavor, ...moonFlavor]
      .map(toBulletLine)
      .filter(Boolean);

    const dateLocal = story?.meta?.date_local || story?.public?.date_local || "unknown-date";
    const userId = getUserId(story);

    // ✅ seedは “render系と近い重力” に寄せる（でも自由に上書き可）
    const seedStr =
      seed ||
      `${dateLocal}|${userId}|reso|theme=${themeKey}|top=${safeStr(topAspectType, "none")}|moon=${safeStr(
        moonKeyForDict,
        "none"
      )}|personal=${allowPersonal ? "1" : "0"}`;

    // ✅ 重複なし
    const bullets = pickStableManyUnique(pool, max, seedStr);

    if (debug) {
      console.log("[reso] themeKey=", themeKey);
      console.log("[reso] baseSetLen=", baseSet.length);
      console.log("[reso] topAspectType=", topAspectType, "aspectFlavorLen=", aspectFlavor.length);
      console.log("[reso] moonKeyForDict=", moonKeyForDict, "moonFlavorLen=", moonFlavor.length);
      console.log("[reso] poolLen=", pool.length, "pickedLen=", bullets.length);
      console.log("[reso] seedStr=", seedStr);
    }

    return {
      theme: themeKey,
      moon_sign: { key: moonSignKey, ja: moonSignJa },
      top_aspect: topAspectType,
      bullets: Array.isArray(bullets) ? bullets : [],
    };
  } catch (e) {
    return {
      theme: "emotion_inner",
      moon_sign: { key: null, ja: null },
      top_aspect: null,
      bullets: [],
      error: e?.message || String(e),
    };
  }
}

module.exports = {
  buildResonanceBullets,

  // ✅ NEW exports for sky-layer FIX
  elementModalityFromSky,
  buildSkyLayerLine,
};
