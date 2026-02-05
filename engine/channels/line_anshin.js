"use strict";

/**
 * channels/line_anshin.js
 * - あんしんネイタル（personal command）
 * - 予言なし／評価なし／構造のみ
 */

function toDotDate(s) {
  return String(s || "").replace(/-/g, ".");
}

function safeStr(x) {
  return String(x ?? "");
}

function norm360(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return ((x % 360) + 360) % 360;
}

function signIndexFromLon(lon) {
  const v = norm360(lon);
  if (!Number.isFinite(v)) return null;
  return Math.floor(v / 30);
}

function extractNatalLongitudes(natalCacheDoc) {
  const d = natalCacheDoc || {};
  const out = {};

  const ALIASES = {
    sun: "sun",
    moon: "moon",
    mercury: "mercury",
    venus: "venus",
    mars: "mars",
    jupiter: "jupiter",
    saturn: "saturn",
    uranus: "uranus",
    neptune: "neptune",
    pluto: "pluto",
    asc: "asc",
    mc: "mc",
  };

  const normalizeKey = (k) => ALIASES[String(k || "").toLowerCase()] || String(k || "").toLowerCase();

  const put = (key, lon) => {
    const nk = normalizeKey(key);
    if (typeof lon === "number" && Number.isFinite(lon)) out[nk] = norm360(lon);
  };

  const putFromObj = (key, v) => {
    if (typeof v === "number") return put(key, v);
    if (!v || typeof v !== "object") return;
    put(key, v.lon_deg);
    put(key, v.lon);
    put(key, v.longitude);
    if (Array.isArray(v.data) && typeof v.data[0] === "number") put(key, v.data[0]);
  };

  if (d.bodies && typeof d.bodies === "object") for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
  if (d.points && typeof d.points === "object") {
    for (const p of ["asc", "mc"]) if (p in d.points) putFromObj(p, d.points[p]);
  }

  const bodiesMap =
    d?.min?.bodies ||
    d?.min?.natal_positions ||
    d?.natal_positions ||
    d?.positions ||
    null;
  if (bodiesMap && typeof bodiesMap === "object") for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);

  const legacySrc = (d.min && d.min.bodies) || d.bodies_min || d.natal_bodies || null;
  if (legacySrc && typeof legacySrc === "object") for (const [k, v] of Object.entries(legacySrc)) putFromObj(k, v);

  return out;
}

function pickManyStable(arr, seed, count = 3, pickStable) {
  const pool = Array.isArray(arr) ? arr.filter(Boolean) : [];
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const cand = pickStable(pool, `${seed}|${i}`);
    if (!cand) break;
    if (used.has(cand)) {
      const alt = pool.find((x) => !used.has(x));
      if (!alt) break;
      out.push(alt);
      used.add(alt);
    } else {
      out.push(cand);
      used.add(cand);
    }
  }
  return out;
}

function renderAnshinLine(payload, deps = {}) {
  const dict = deps?.dict || require("../../dict");
  const PLANETS = dict?.PLANETS_V2 || dict?.PLANETS || {};
  const SIGNS = dict?.SIGNS_V2 || dict?.SIGNS || {};
  const ANSHIN = dict?.ANSHIN_V1 || require("../../dict/anshin.v1").ANSHIN_V1;

  const story = payload?.story || null;
  const dateLabel = toDotDate(payload?.meta?.date_local || story?.meta?.date_local);
  const natalCache = payload?.natal_cache || payload?.natal || null;

  if (!natalCache) {
    return [
      "🫧 あんしんネイタル",
      "（ネイタルが未登録だった🙏「はじめる」で登録してね）",
    ].join("\n");
  }

  const longitudes = extractNatalLongitudes(natalCache);
  const planetKeys = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];

  const elementWeight = { earth: 3, water: 2, air: 1, fire: 1, unknown: 0 };
  const modalityWeight = { fixed: 3, cardinal: 1, mutable: 1, unknown: 0 };
  const planetWeight = {
    saturn: 6,
    sun: 5,
    moon: 4,
    venus: 4,
    mercury: 2,
    mars: 2,
    jupiter: 2,
    uranus: 1,
    neptune: 1,
    pluto: 1,
  };
  const order = planetKeys;

  function buildAspectList() {
    const A = dict?.ASPECTS_V2 || {};
    const out = [];
    const groups = [A.major, A.deep_space, A.craft_space].filter(Boolean);
    for (const g of groups) {
      for (const [k, v] of Object.entries(g || {})) {
        const deg = Number(v?.deg ?? v?.angle_deg);
        if (!Number.isFinite(deg)) continue;
        out.push({ type: String(k), deg });
      }
    }
    return out;
  }

  const ASPECT_LIST = buildAspectList();
  const normalizeAspectType = deps?.normalizeAspectType || ((x) => String(x || ""));

  function absAngularDistance(a, b) {
    const x = Math.abs(norm360(a) - norm360(b));
    return x > 180 ? 360 - x : x;
  }

  function bestAspectForDistance(dist, list, orbMax = 6) {
    let best = null;
    for (const a of list) {
      const delta = Math.abs(dist - a.deg);
      if (delta <= orbMax && (!best || delta < best.delta)) {
        best = { type: a.type, aspect_deg: a.deg, delta };
      }
    }
    return best;
  }

  const aspectWeight = {
    conjunction: 1.2,
    trine: 1.4,
    sextile: 1.0,
    square: -1.0,
    opposition: -1.0,
    quincunx_150: -0.8,
    semi_square_45: -0.5,
    sesqui_square_135: -0.6,
    semi_sextile_30: 0.4,
    quintile_72: 0.6,
    biquintile_144: 0.7,
    novile_40: 0.5,
    binovile_80: 0.6,
    quadranovile_160: 0.6,
    decile_36: 0.5,
    tridecile_108: 0.6,
  };

  function aspectScore(type, delta, orbMax, scale = 1) {
    const t = normalizeAspectType(type);
    const w = aspectWeight[t] ?? 0;
    const closeness = Math.max(0, 1 - (delta / orbMax));
    return w * closeness * scale;
  }

  const natalAspects = [];
  for (let i = 0; i < planetKeys.length; i++) {
    const a = planetKeys[i];
    const lonA = longitudes[a];
    if (!Number.isFinite(lonA)) continue;
    for (let j = i + 1; j < planetKeys.length; j++) {
      const b = planetKeys[j];
      const lonB = longitudes[b];
      if (!Number.isFinite(lonB)) continue;
      const dist = absAngularDistance(lonA, lonB);
      const best = bestAspectForDistance(dist, ASPECT_LIST, 6);
      if (!best) continue;
      natalAspects.push({ a, b, ...best });
    }
  }

  const transitTouches = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const placements = [];
  for (const pk of planetKeys) {
    const lon = longitudes[pk];
    if (!Number.isFinite(lon)) continue;
    const idx = signIndexFromLon(lon);
    if (!Number.isFinite(idx)) continue;
    const signKey = deps?.signKeyFromIndex ? deps.signKeyFromIndex(idx) : null;
    const signJa = deps?.signJaFromIndex ? deps.signJaFromIndex(idx) : null;
    const signMeta = deps?.signMeta ? deps.signMeta(signKey) : null;

    const el = String(signMeta?.element || "unknown");
    const mo = String(signMeta?.modality || "unknown");
    const baseScore =
      (elementWeight[el] || 0) +
      (modalityWeight[mo] || 0) +
      (planetWeight[pk] || 0) +
      ((el === "earth" && mo === "fixed") ? 1 : 0);

    let aspectScoreSum = 0;
    for (const asp of natalAspects) {
      if (asp.a !== pk && asp.b !== pk) continue;
      aspectScoreSum += aspectScore(asp.type, asp.delta, 6, 1);
    }

    let transitScoreSum = 0;
    for (const tp of transitTouches) {
      const nKey = String(tp?.natal_body_or_point || "").toLowerCase();
      if (nKey !== pk) continue;
      const tType = tp?.aspect || tp?.aspect_type || tp?.type || "";
      const d = Number(tp?.orb_deg ?? 99);
      if (!Number.isFinite(d)) continue;
      transitScoreSum += aspectScore(tType, d, 6, 0.6);
    }

    placements.push({
      planetKey: pk,
      planetJa: PLANETS?.bodies?.[pk]?.label_ja || pk,
      signKey,
      signJa: signJa || signMeta?.label_ja || signKey || "",
      signCore: signMeta?.core || "",
      signFlavor: signMeta?.flavor || "",
      element: el,
      modality: mo,
      score: baseScore + aspectScoreSum + transitScoreSum,
    });
  }

  if (!placements.length) {
    return [
      "🫧 あんしんネイタル",
      "（ネイタルの位置情報が見つからなかった🙏）",
    ].join("\n");
  }

  placements.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return order.indexOf(a.planetKey) - order.indexOf(b.planetKey);
  });

  const top = placements.slice(0, 3);

  const intro = (ANSHIN?.intro_lines || [
    "🫧 あんしんネイタル｜{date}",
    "揺らされにくい領域の構造。",
    "評価せず、残り方だけを置く。",
  ])
    .map((l) => String(l || "").replace("{date}", dateLabel || ""))
    .join("\n")
    .trim() + "\n";

  const blocks = top.map((p, i) => {
    const planet = PLANETS?.bodies?.[p.planetKey] || {};
    const pCore = planet?.core || "";
    const pRole = planet?.role || planet?.core || "";
    const sCore = p.signCore || "";
    const sFlavor = p.signFlavor || "";
    const sPhrase =
      (ANSHIN?.sign_phrase && ANSHIN.sign_phrase[p.signKey]) ||
      (sFlavor ? String(sFlavor || "").replace(/[。．\.]+$/g, "") : sCore);
    const residue =
      (ANSHIN?.planet_residue && ANSHIN.planet_residue[p.planetKey]) ||
      `${pRole}が残りやすい領域`;
    const summaryMap = ANSHIN?.summary_by_sign_planet || {};
    const summaryLine = summaryMap?.[p.signKey]?.[p.planetKey] || "";

    const summary = summaryLine
      ? `${summaryLine}`
      : (sPhrase ? `${sPhrase}に、${residue}。` : `${sCore}に、${residue}。`);

    const emoji = (ANSHIN?.planet_emoji && ANSHIN.planet_emoji[p.planetKey]) || "🪐";
    const lines = [];
    lines.push(`${emoji}${p.planetJa}（${p.signJa}）`);
    lines.push(summary);
    return lines.join("\n");
  });

  const tail = (ANSHIN?.tail_lines || [
    "",
    "ここがあるから、揺れないわけでもない。",
    "ただ、崩れない理由になりやすい場所。",
    "",
    "安心とは感情ではなく、",
    "残り方の構造である。",
  ])
    .map((l) => String(l || ""))
    .join("\n");

  return [intro, blocks.join("\n\n"), tail].join("\n").trim();
}

module.exports = { renderAnshinLine };
