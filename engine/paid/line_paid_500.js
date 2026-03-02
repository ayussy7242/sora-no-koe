"use strict";

const { swisseph } = require("../../config/swisseph");
const { isRetrograde, buildRetrogradeMap } = require("../astro/retrograde");

const TOKYO_LAT = 35.6895;
const TOKYO_LON = 139.6917;
const HOUSE_SYSTEM_WHOLE_SIGN = "W";

const BODY_WEIGHT = {
  sun: 1.0,
  moon: 1.0,
  mercury: 0.9,
  venus: 0.9,
  mars: 0.9,
  jupiter: 0.8,
  saturn: 0.8,
  uranus: 0.7,
  neptune: 0.7,
  pluto: 0.7,
  lilith: 0.5,
  chiron: 0.5,
};

const SLOW_TRANSITS = new Set(["saturn", "uranus", "neptune", "pluto"]);
const TSUKIJI_MIN_DAYS = 14;
const TSUKIJI_ORB_LIMIT = 3;
const TSUKIJI_MAX_ITEMS = 5;
const TSUKIJI_RETRO_KEYS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

const SIGN_GLYPH = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

const FULL_MOON_NAME_BY_MONTH = {
  1: "Wolf Moon",
  2: "Snow Moon",
  3: "Worm Moon",
  4: "Pink Moon",
  5: "Flower Moon",
  6: "Strawberry Moon",
  7: "Buck Moon",
  8: "Sturgeon Moon",
  9: "Harvest Moon",
  10: "Hunter's Moon",
  11: "Beaver Moon",
  12: "Cold Moon",
};

function norm360(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function absAngularDistance(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

function _glyphForBodyLocal(key) {
  const k = String(key || "").toLowerCase();
  const map = {
    sun: "☉",
    moon: "☽",
    mercury: "☿",
    venus: "♀",
    mars: "♂",
    jupiter: "♃",
    saturn: "♄",
    uranus: "♅",
    neptune: "♆",
    pluto: "♇",
    chiron: "⚷",
    lilith: "⚸",
    north_node: "☊",
    south_node: "☋",
  };
  return map[k] || "";
}

function _signJaLocal(dict, signKey) {
  const key = String(signKey || "").toLowerCase();
  if (!key) return "";
  return (
    dict?.SIGNS_V2?.signs?.[key]?.label_ja ||
    dict?.SIGNS?.signs?.[key]?.label_ja ||
    dict?.SIGNS_V1?.signs?.[key]?.label_ja ||
    ""
  );
}

function _normAspectKey(raw) {
  return String(raw || "").toLowerCase().trim();
}

function _aspectMetaFromDict(dict, key) {
  if (!key) return null;
  const v2 = dict?.ASPECTS_V2 || {};
  const v1 = dict?.ASPECTS_V1 || {};
  const pools = [v2.major, v2.deep_space, v2.craft_space, v1.major, v1.deep_space, v1.craft_space];
  for (const p of pools) {
    if (p && p[key]) return p[key];
  }
  return null;
}

function _aspectInfo(dict, rawType, aspectDeg) {
  const k = _normAspectKey(rawType);
  let meta = _aspectMetaFromDict(dict, k);

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

function weightForBody(key) {
  const k = String(key || "").toLowerCase();
  return BODY_WEIGHT[k] ?? 0.6;
}

function scoreForAspect({ orb, natalKey, transitKey }) {
  const wN = weightForBody(natalKey);
  const wT = weightForBody(transitKey);
  const o = Math.max(0.1, Number(orb) || 0.1);
  return (wN + wT) * (1 / (o + 0.5));
}

function jdUtFromIso(asOfISO) {
  const d = new Date(asOfISO);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour =
    d.getUTCHours() +
    d.getUTCMinutes() / 60 +
    d.getUTCSeconds() / 3600 +
    d.getUTCMilliseconds() / 3600000;
  return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
}

function normalizeHousesResult(hs) {
  if (!hs || typeof hs !== "object") return { cusps: null, ascmc: null };
  const cusps = hs.house || hs.cusps || hs.cusp || null;
  let ascmc = hs.ascmc || hs.ascmc || hs.asc_mc || null;

  if (!ascmc) {
    const asc = typeof hs.ascendant === "number" ? hs.ascendant : null;
    const mc = typeof hs.mc === "number" ? hs.mc : null;
    const vertex = typeof hs.vertex === "number" ? hs.vertex : null;
    if (asc != null || mc != null || vertex != null) {
      ascmc = [asc, mc, hs.armc ?? null, vertex];
    }
  }

  return { cusps, ascmc };
}

function pickascmcvertex(ascmc) {
  if (ascmc && typeof ascmc === "object" && ArrayBuffer.isView(ascmc)) {
    ascmc = Array.from(ascmc);
  }

  if (Array.isArray(ascmc)) {
    const asc = Number(ascmc[0]);
    const mc = Number(ascmc[1]);
    const vertex = Number(ascmc[3]);
    return {
      asc: Number.isFinite(asc) ? asc : null,
      mc: Number.isFinite(mc) ? mc : null,
      vertex: Number.isFinite(vertex) ? vertex : null,
    };
  }

  if (ascmc && typeof ascmc === "object") {
    const asc = Number(ascmc.asc ?? ascmc.asc_deg ?? ascmc[0]);
    const mc = Number(ascmc.mc ?? ascmc.mc_deg ?? ascmc[1]);
    const vertex = Number(ascmc.vertex ?? ascmc.vertex_deg ?? ascmc[3]);
    return {
      asc: Number.isFinite(asc) ? asc : null,
      mc: Number.isFinite(mc) ? mc : null,
      vertex: Number.isFinite(vertex) ? vertex : null,
    };
  }

  return { asc: null, mc: null, vertex: null };
}

function computeTokyoAscDeg(asOfISO) {
  if (!swisseph || typeof swisseph.swe_houses !== "function") return null;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return null;
  const hsRaw = swisseph.swe_houses(jdUt, TOKYO_LAT, TOKYO_LON, HOUSE_SYSTEM_WHOLE_SIGN);
  const { ascmc } = normalizeHousesResult(hsRaw);
  const { asc } = pickascmcvertex(ascmc);
  return Number.isFinite(Number(asc)) ? norm360(asc) : null;
}

function signIndexFromKey(dict, signKey) {
  const order =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    [
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ];
  const key = String(signKey || "").toLowerCase();
  return order.indexOf(key);
}

function houseNumberForSignIndex(signIndex, ascIndex) {
  if (signIndex < 0 || ascIndex < 0) return null;
  return ((signIndex - ascIndex + 12) % 12) + 1;
}

function formatDateYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function toIsoAtJstNoon(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T03:00:00.000Z`;
}

function calcTransitLon(bodyKey, asOfISO) {
  if (!swisseph) return null;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return null;

  const map = {
    sun: swisseph.SE_SUN,
    moon: swisseph.SE_MOON,
    mercury: swisseph.SE_MERCURY,
    venus: swisseph.SE_VENUS,
    mars: swisseph.SE_MARS,
    jupiter: swisseph.SE_JUPITER,
    saturn: swisseph.SE_SATURN,
    uranus: swisseph.SE_URANUS,
    neptune: swisseph.SE_NEPTUNE,
    pluto: swisseph.SE_PLUTO,
    chiron: swisseph.SE_CHIRON,
    lilith: swisseph.SE_MEAN_APOG,
  };
  const id = map[String(bodyKey || "").toLowerCase()];
  if (id == null) return null;

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
  const out = swisseph.swe_calc_ut(jdUt, id, flags);
  if (!out || out.error) return null;
  const lon = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
  if (!Number.isFinite(lon)) return null;
  return norm360(lon);
}

function findAspectWindow({ transitKey, natalLon, aspectDeg, asOfISO, maxDays = 240, orbLimit = 3 }) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;

  let start = null;
  let end = null;
  let peak = null;
  let bestOrb = Infinity;

  const steps = maxDays;
  for (let i = steps; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lon = calcTransitLon(transitKey, iso);
    if (lon == null) continue;
    const dist = absAngularDistance(lon, natalLon);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit) {
      if (!start) start = new Date(d.getTime());
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
    } else if (start && !end) {
      end = new Date(d.getTime());
    }
  }

  for (let i = 0; i <= steps; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lon = calcTransitLon(transitKey, iso);
    if (lon == null) continue;
    const dist = absAngularDistance(lon, natalLon);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit) {
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
      end = new Date(d.getTime());
    } else if (end) {
      break;
    }
  }

  if (!start || !end) return null;
  return {
    start,
    end,
    peak,
    bestOrb,
  };
}

function findTransitTransitWindow({ aKey, bKey, aspectDeg, asOfISO, maxDays = 240, orbLimit = 3 }) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;

  let start = null;
  let end = null;
  let peak = null;
  let bestOrb = Infinity;

  const steps = maxDays;
  for (let i = steps; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (lonA == null || lonB == null) continue;
    const dist = absAngularDistance(lonA, lonB);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit) {
      if (!start) start = new Date(d.getTime());
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
    } else if (start && !end) {
      end = new Date(d.getTime());
    }
  }

  for (let i = 0; i <= steps; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (lonA == null || lonB == null) continue;
    const dist = absAngularDistance(lonA, lonB);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit) {
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
      end = new Date(d.getTime());
    } else if (end) {
      break;
    }
  }

  if (!start || !end) return null;
  return { start, end, peak, bestOrb };
}

function findRetrogradeWindow(bodyKey, asOfISO, maxDays = 500) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;

  if (!isRetrograde(bodyKey, asOfISO)) return null;

  let start = null;
  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    if (!isRetrograde(bodyKey, iso)) {
      start = new Date(d.getTime() + 86400000);
      break;
    }
  }
  if (!start) start = new Date(now.getTime() - maxDays * 86400000);

  let end = null;
  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    if (!isRetrograde(bodyKey, iso)) {
      end = new Date(d.getTime() - 86400000);
      break;
    }
  }
  if (!end) end = new Date(now.getTime() + maxDays * 86400000);

  return { start, end };
}

function buildBunpuTop5(story, dict) {
  const tps = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const asOfISO = story?.meta?.as_of || null;

  const scored = tps
    .filter((tp) => Number.isFinite(Number(tp?.orb_deg)))
    .filter((tp) => Number(tp.orb_deg) <= 6)
    .map((tp) => {
      const nKey = String(tp?.natal_body_or_point || tp?.natal_body || tp?.a || "").toLowerCase();
      const tKey = String(tp?.transit_body || tp?.b || "").toLowerCase();
      return {
        item: tp,
        score: scoreForAspect({ orb: tp.orb_deg, natalKey: nKey, transitKey: tKey }),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!scored.length) return ["該当なし"];

  const lines = [];
  const retroMap = buildRetrogradeMap(
    asOfISO,
    scored.map((row) => String(row?.item?.transit_body || row?.item?.b || "").toLowerCase()).filter(Boolean)
  );

  scored.forEach((row, idx) => {
    const it = row.item;
    const nKey = String(it?.natal_body_or_point || it?.natal_body || it?.a || "").toLowerCase();
    const tKey = String(it?.transit_body || it?.b || "").toLowerCase();
    const nGlyph = _glyphForBodyLocal(nKey);
    const tGlyph = _glyphForBodyLocal(tKey);
    const nLabel = dict?.PLANETS_V2?.bodies?.[nKey]?.label_ja || dict?.POINTS_V1?.points?.[nKey]?.label_ja || nKey;
    const tLabel = dict?.PLANETS_V2?.bodies?.[tKey]?.label_ja || dict?.POINTS_V1?.points?.[tKey]?.label_ja || tKey;
    const nSign = it?.natal_sign_ja || _signJaLocal(dict, it?.natal_sign_key || it?.natal_sign || "");
    const tSign = it?.transit_sign_ja || _signJaLocal(dict, it?.transit_sign_key || it?.transit_sign || "");
    const nSignText = nSign ? `（${nSign}）` : "";
    const tRetro = retroMap[tKey] ? "(R)" : "";
    const tSignText = tSign ? `（${tSign}）${tRetro}` : tRetro;

    const aspectInfo = _aspectInfo(dict, it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja, it?.aspect_deg);
    const aspectLabel = aspectInfo?.label_ja || String(it?.aspect || it?.type || it?.aspectType || "");
    const aspectDeg = Number.isFinite(Number(it?.aspect_deg))
      ? Number(it.aspect_deg)
      : Number.isFinite(Number(aspectInfo?.deg))
        ? Number(aspectInfo.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(it?.orb_deg)) ? Number(it.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}°` : "";
    const scoreText = Number.isFinite(Number(row?.score)) ? Number(row.score).toFixed(2) : "";

    lines.push(
      `${idx + 1}) (N) ${nGlyph ? `${nGlyph} ` : ""}${nLabel}${nSignText}`
    );
    lines.push(`   × (T) ${tGlyph ? `${tGlyph} ` : ""}${tLabel}${tSignText}`);
    lines.push(`   ${aspectLabel} ${degText}｜orb ${orbText}｜score ${scoreText}`.trim());
    if (idx < scored.length - 1) lines.push("");
  });

  return lines;
}

function buildHouseBlock(story, dict, asOfISO) {
  const ascDeg = asOfISO ? computeTokyoAscDeg(asOfISO) : null;
  const ascIndex = Number.isFinite(Number(ascDeg)) ? Math.floor(Number(ascDeg) / 30) : null;

  const transitSigns = story?.public?.transit_signs || {};
  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
  ];

  const houseBuckets = new Map();
  for (let i = 1; i <= 12; i++) houseBuckets.set(i, { items: [], score: 0, signKey: null, signJa: null, signGlyph: null });

  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  const signOrder =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    [
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ];

  if (ascIndex != null && ascIndex >= 0) {
    for (let h = 1; h <= 12; h++) {
      const key = signOrder[(ascIndex + h - 1) % 12];
      const signJa = _signJaLocal(dict, key);
      const glyph = SIGN_GLYPH[key] || "";
      const bucket = houseBuckets.get(h);
      bucket.signKey = key;
      bucket.signJa = signJa || "";
      bucket.signGlyph = glyph || "";
    }
  }

  bodyOrder.forEach((key) => {
    const signKeyRaw = transitSigns?.[key]?.sign_key || "";
    const signKey = String(signKeyRaw || "").toLowerCase();
    const signJa = transitSigns?.[key]?.sign_ja || _signJaLocal(dict, signKey || "");
    const signIndex = signIndexFromKey(dict, signKey || "");
    if (signIndex < 0 || ascIndex == null) return;
    const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
    if (!houseNo) return;
    const glyph = _glyphForBodyLocal(key);
    const retro = retroMap[key] ? "(R)" : "";
    const signGlyph = SIGN_GLYPH[signKey] || "";
    const entry = `${glyph ? `${glyph}` : ""}${signGlyph}${retro}`;
    const bucket = houseBuckets.get(houseNo);
    bucket.items.push(entry);
    bucket.score += weightForBody(key);
  });

  const rows = [];
  for (let h = 1; h <= 12; h++) {
    const bucket = houseBuckets.get(h);
    if (!bucket) continue;
    const itemsText = bucket.items.length ? bucket.items.join(" ") : "—";
    const scoreText = Number(bucket.score).toFixed(2);
    const signText = bucket.signJa ? `${bucket.signGlyph || ""}${bucket.signJa}` : "";
    rows.push({
      house: h,
      itemsText,
      score: bucket.score,
      scoreText,
      signText,
    });
  }

  rows.sort((a, b) => b.score - a.score);

  return rows.map((row) => {
    const signText = row.signText ? `｜${row.signText}` : "";
    return `第${row.house}ハウス${signText}｜${row.itemsText}｜score ${row.scoreText}`;
  });
}

function buildTsukijiBlock(story, dict, asOfISO) {
  const baseISO = asOfISO || new Date().toISOString();
  const now = new Date(baseISO);
  if (Number.isNaN(now.getTime())) return ["該当なし"];

  const tps = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const candidates = tps
    .filter((tp) => Number.isFinite(Number(tp?.orb_deg)))
    .filter((tp) => Number(tp.orb_deg) <= TSUKIJI_ORB_LIMIT);

  const approachRows = [];

  candidates.forEach((tp) => {
    const tKey = String(tp?.transit_body || tp?.b || "").toLowerCase();
    const nKey = String(tp?.natal_body_or_point || tp?.natal_body || tp?.a || "").toLowerCase();
    const tGlyph = _glyphForBodyLocal(tKey);
    const nGlyph = _glyphForBodyLocal(nKey);
    const tLabel = dict?.PLANETS_V2?.bodies?.[tKey]?.label_ja || dict?.POINTS_V1?.points?.[tKey]?.label_ja || tKey;
    const nLabel = dict?.PLANETS_V2?.bodies?.[nKey]?.label_ja || dict?.POINTS_V1?.points?.[nKey]?.label_ja || nKey;
    const tSign = tp?.transit_sign_ja || _signJaLocal(dict, tp?.transit_sign_key || tp?.transit_sign || "");
    const nSign = tp?.natal_sign_ja || _signJaLocal(dict, tp?.natal_sign_key || tp?.natal_sign || "");
    const tSignText = tSign ? `（${tSign}）` : "";
    const nSignText = nSign ? `（${nSign}）` : "";

    const aspectInfo = _aspectInfo(dict, tp?.aspect || tp?.type || tp?.aspectType || tp?.aspect_label_ja, tp?.aspect_deg);
    const aspectLabel = aspectInfo?.label_ja || String(tp?.aspect || tp?.type || tp?.aspectType || "");
    const aspectDeg = Number.isFinite(Number(tp?.aspect_deg))
      ? Number(tp.aspect_deg)
      : Number.isFinite(Number(aspectInfo?.deg))
        ? Number(aspectInfo.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(tp?.orb_deg)) ? Number(tp.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}°` : "";

    const window = findAspectWindow({
      transitKey: tKey,
      natalLon: Number(tp?.natal_lon_deg),
      aspectDeg: aspectDeg != null ? aspectDeg : 0,
      asOfISO: baseISO,
      maxDays: 240,
      orbLimit: TSUKIJI_ORB_LIMIT,
    });

    if (!window?.start || !window?.end) return;
    const durationMs = window.end.getTime() - window.start.getTime();
    const durationDays = Math.ceil(durationMs / 86400000);
    if (!Number.isFinite(durationDays) || durationDays < TSUKIJI_MIN_DAYS) return;
    if (!(window.start <= now && now <= window.end)) return;

    const startText = window?.start ? formatDateYmd(window.start) : "-";
    const endText = window?.end ? formatDateYmd(window.end) : "-";
    const remainingDays = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));

    approachRows.push({
      orb,
      lines: [
        `(T) ${tGlyph ? `${tGlyph} ` : ""}${tLabel}${tSignText}`,
        `× (N) ${nGlyph ? `${nGlyph} ` : ""}${nLabel}${nSignText}`,
        `${aspectLabel} ${degText}｜orb ${orbText}`.trim(),
        `${startText} → ${endText}`,
        `残り ${remainingDays}日`,
      ],
    });
  });

  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .filter((r) => Number(r.orb_deg) <= TSUKIJI_ORB_LIMIT)
    .forEach((r) => {
      const aKey = String(r?.a || "").toLowerCase();
      const bKey = String(r?.b || "").toLowerCase();
      const aspectDeg = Number.isFinite(Number(r?.aspect_deg)) ? Number(r.aspect_deg) : null;
      if (!aKey || !bKey || !Number.isFinite(aspectDeg)) return;

      const window = findTransitTransitWindow({
        aKey,
        bKey,
        aspectDeg,
        asOfISO: baseISO,
        maxDays: 240,
        orbLimit: TSUKIJI_ORB_LIMIT,
      });
      if (!window?.start || !window?.end) return;
      const durationMs = window.end.getTime() - window.start.getTime();
      const durationDays = Math.ceil(durationMs / 86400000);
      if (!Number.isFinite(durationDays) || durationDays < TSUKIJI_MIN_DAYS) return;
      if (!(window.start <= now && now <= window.end)) return;

      const aGlyph = _glyphForBodyLocal(aKey);
      const bGlyph = _glyphForBodyLocal(bKey);
      const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
      const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
      const aSign = r?.a_sign_ja || _signJaLocal(dict, r?.a_sign_key || "");
      const bSign = r?.b_sign_ja || _signJaLocal(dict, r?.b_sign_key || "");
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";

      const aspectInfo = _aspectInfo(dict, r?.type || r?.aspT || r?.aspect, aspectDeg);
      const aspectLabel = aspectInfo?.label_ja || String(r?.type || r?.aspT || r?.aspect || "");
      const degText = `${Math.round(aspectDeg)}°`;

      const startText = window?.start ? formatDateYmd(window.start) : "-";
      const endText = window?.end ? formatDateYmd(window.end) : "-";
      const remainingDays = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));

      approachRows.push({
        orb: Number.isFinite(Number(r?.orb_deg)) ? Number(r.orb_deg) : null,
        lines: [
          `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText}`,
          `× (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`,
          `${aspectLabel} ${degText}`,
          `${startText} → ${endText}`,
          `残り ${remainingDays}日`,
        ],
      });
    });

  const approachLines = [];
  approachRows
    .sort((a, b) => Number(a.orb || 0) - Number(b.orb || 0))
    .slice(0, TSUKIJI_MAX_ITEMS)
    .forEach((row, idx) => {
      if (idx === 0) approachLines.push("【接近】");
      if (idx > 0) approachLines.push("");
      approachLines.push(`${idx + 1}) ${row.lines[0]}`);
      approachLines.push(...row.lines.slice(1).map((x) => `   ${x}`));
    });

  const retroLines = [];
  TSUKIJI_RETRO_KEYS.forEach((key) => {
    if (!isRetrograde(key, baseISO)) return;
    const window = findRetrogradeWindow(key, baseISO, 500);
    if (!window?.start || !window?.end) return;
    const startText = formatDateYmd(window.start);
    const endText = formatDateYmd(window.end);
    const remainingDays = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));
    const glyph = _glyphForBodyLocal(key);
    const label = dict?.PLANETS_V2?.bodies?.[key]?.label_ja || key;
    retroLines.push(`${glyph ? `${glyph} ` : ""}${label} 逆行中`);
    retroLines.push(`${startText} → ${endText}`);
    retroLines.push(`あと ${remainingDays}日`);
    retroLines.push("");
  });
  if (retroLines.length) {
    if (retroLines[retroLines.length - 1] === "") retroLines.pop();
    retroLines.unshift("【逆行】");
  }

  const lines = [];
  if (approachLines.length) lines.push(...approachLines);
  if (approachLines.length && retroLines.length) lines.push("");
  if (retroLines.length) lines.push(...retroLines);

  return lines.length ? lines : ["該当なし"];
}

function buildElementModalityBlock(story) {
  const skyStrata = story?.public?.sky_strata || story?.meta?.sky_strata || null;
  const element = skyStrata?.element_count || {};
  const modality = skyStrata?.modality_count || {};
  const hasElement =
    Number(element.fire || 0) + Number(element.earth || 0) + Number(element.air || 0) + Number(element.water || 0) > 0;
  const hasModality =
    Number(modality.cardinal || 0) + Number(modality.fixed || 0) + Number(modality.mutable || 0) > 0;

  if (!hasElement && !hasModality) return ["該当なし"];

  return [
    "🔥 元素／三区分（T）",
    "【惑星属性】",
    `🔥${Number(element.fire || 0)} 🪨${Number(element.earth || 0)} 💨${Number(element.air || 0)} 💧${Number(element.water || 0)}`,
    "【三区分】",
    `🏃${Number(modality.cardinal || 0)} 🧱${Number(modality.fixed || 0)} 🌿${Number(modality.mutable || 0)}`,
  ];
}

function normalizeAngleDiff(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  const n = ((v + 180) % 360) - 180;
  return n;
}

function formatDateYmdHm(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

function findNextMoonPhase(asOfISO, targetDeg, maxDays = 40) {
  if (!asOfISO) return null;
  const start = new Date(asOfISO);
  if (Number.isNaN(start.getTime())) return null;

  const stepHours = 6;
  let prev = null;
  let prevTime = null;

  const totalSteps = Math.ceil((maxDays * 24) / stepHours);
  for (let i = 0; i <= totalSteps; i++) {
    const t = new Date(start.getTime() + i * stepHours * 3600 * 1000);
    const iso = t.toISOString();
    const sunLon = calcTransitLon("sun", iso);
    const moonLon = calcTransitLon("moon", iso);
    if (sunLon == null || moonLon == null) continue;
    const diff = norm360(moonLon - sunLon);
    const offset = normalizeAngleDiff(diff - targetDeg);
    if (offset == null) continue;

    if (prev != null && offset != null && prev * offset <= 0) {
      // refine by binary search
      let left = prevTime;
      let right = t;
      let leftVal = prev;
      let rightVal = offset;
      for (let k = 0; k < 24; k++) {
        const mid = new Date((left.getTime() + right.getTime()) / 2);
        const midIso = mid.toISOString();
        const sunMid = calcTransitLon("sun", midIso);
        const moonMid = calcTransitLon("moon", midIso);
        if (sunMid == null || moonMid == null) break;
        const midDiff = norm360(moonMid - sunMid);
        const midOffset = normalizeAngleDiff(midDiff - targetDeg);
        if (midOffset == null) break;
        if (leftVal * midOffset <= 0) {
          right = mid;
          rightVal = midOffset;
        } else {
          left = mid;
          leftVal = midOffset;
        }
      }
      return right;
    }

    prev = offset;
    prevTime = t;
  }

  return null;
}

function pickApplyingUpcomingAspects(story, dict, asOfISO, maxItems = 5) {
  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const asOf = asOfISO ? new Date(asOfISO) : null;
  if (!asOf || Number.isNaN(asOf.getTime())) return [];

  const candidates = skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .filter((r) => Number(r.orb_deg) <= 6)
    .map((r) => {
      const aKey = String(r?.a || "").toLowerCase();
      const bKey = String(r?.b || "").toLowerCase();
      const aspectDeg = Number(r?.aspect_deg);
      const nowOrb = Number(r?.orb_deg);
      return { aKey, bKey, aspectDeg, nowOrb, raw: r };
    })
    .filter((r) => r.aKey && r.bKey && Number.isFinite(r.aspectDeg));

  const upcoming = [];
  candidates.forEach((c) => {
    const tPlus = new Date(asOf.getTime() + 24 * 3600 * 1000);
    const orbTomorrow = (() => {
      const lonA = calcTransitLon(c.aKey, tPlus.toISOString());
      const lonB = calcTransitLon(c.bKey, tPlus.toISOString());
      if (lonA == null || lonB == null) return null;
      const dist = absAngularDistance(lonA, lonB);
      return Math.abs(dist - c.aspectDeg);
    })();

    if (!Number.isFinite(orbTomorrow)) return;
    if (orbTomorrow >= c.nowOrb) return; // not applying

    // search peak in next 14 days
    let best = { orb: c.nowOrb, time: asOf };
    const stepHours = 6;
    const steps = Math.ceil((14 * 24) / stepHours);
    for (let i = 1; i <= steps; i++) {
      const t = new Date(asOf.getTime() + i * stepHours * 3600 * 1000);
      const lonA = calcTransitLon(c.aKey, t.toISOString());
      const lonB = calcTransitLon(c.bKey, t.toISOString());
      if (lonA == null || lonB == null) continue;
      const dist = absAngularDistance(lonA, lonB);
      const orb = Math.abs(dist - c.aspectDeg);
      if (orb < best.orb) best = { orb, time: t };
    }

    upcoming.push({ ...c, peak: best.time });
  });

  upcoming.sort((a, b) => {
    const ta = a?.peak instanceof Date ? a.peak.getTime() : Infinity;
    const tb = b?.peak instanceof Date ? b.peak.getTime() : Infinity;
    if (ta !== tb) return ta - tb;
    return Number(a.nowOrb) - Number(b.nowOrb);
  });
  return upcoming.slice(0, maxItems);
}

function buildKinjitsuBlock(story, dict, asOfISO) {
  // 近日は「リアルタイム起点」を最優先（storyの日時より現在時刻を使う）
  const baseISO = new Date().toISOString();
  const lines = ["📅 近日", ""];
  const items = pickApplyingUpcomingAspects(story, dict, baseISO, 5);
  const retroMap = buildRetrogradeMap(
    baseISO,
    Array.from(new Set(items.flatMap((it) => [it.aKey, it.bKey]).filter(Boolean)))
  );

  items.forEach((it, idx) => {
    if (idx > 0) lines.push("");
    const aKey = it.aKey;
    const bKey = it.bKey;
    const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
    const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
    const aSign = it.raw?.a_sign_ja || _signJaLocal(dict, it.raw?.a_sign_key || "");
    const bSign = it.raw?.b_sign_ja || _signJaLocal(dict, it.raw?.b_sign_key || "");
    const aGlyph = _glyphForBodyLocal(aKey);
    const bGlyph = _glyphForBodyLocal(bKey);
    const aRetro = retroMap[aKey] ? "(R)" : "";
    const bRetro = retroMap[bKey] ? "(R)" : "";
    const aSignText = aSign ? `（${aSign}）${aRetro}` : aRetro;
    const bSignText = bSign ? `（${bSign}）${bRetro}` : bRetro;
    const aspectInfo = _aspectInfo(dict, it.raw?.type || it.raw?.aspT || it.raw?.aspect, it.aspectDeg);
    const aspectLabel = aspectInfo?.label_ja || String(it.raw?.type || it.raw?.aspT || it.raw?.aspect || "");
    const degText = Number.isFinite(Number(it.aspectDeg)) ? `${Math.round(it.aspectDeg)}°` : "";

    lines.push(
      `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText}`,
      `× (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`,
      `${aspectLabel} ${degText}`.trim(),
      `now orb ${Number(it.nowOrb).toFixed(1)}° → peak ${formatDateYmdHm(it.peak)}`
    );
  });

  let newMoon = findNextMoonPhase(baseISO, 0);
  let fullMoon = findNextMoonPhase(baseISO, 180);

  if (newMoon && fullMoon && Math.abs(newMoon.getTime() - fullMoon.getTime()) < 6 * 3600 * 1000) {
    const earlier = newMoon.getTime() <= fullMoon.getTime() ? "new" : "full";
    const shiftISO = new Date(Math.min(newMoon.getTime(), fullMoon.getTime()) + 60 * 60 * 1000).toISOString();
    if (earlier === "new") {
      fullMoon = findNextMoonPhase(shiftISO, 180) || fullMoon;
    } else {
      newMoon = findNextMoonPhase(shiftISO, 0) || newMoon;
    }
  }

  const signOrder =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    [
      "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
    ];

  const moonEvents = [];
  if (newMoon) moonEvents.push({ kind: "new", date: newMoon });
  if (fullMoon) moonEvents.push({ kind: "full", date: fullMoon });
  moonEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  moonEvents.forEach((ev) => {
    const lon = calcTransitLon("moon", ev.date.toISOString());
    const idx = Number.isFinite(Number(lon)) ? Math.floor(((lon % 360) + 360) % 360 / 30) : null;
    const signKey = idx != null ? signOrder[idx] : null;
    const signJa = signKey ? _signJaLocal(dict, signKey) : "";

    if (ev.kind === "new") {
      const signText = signJa ? `${signJa}新月` : "新月";
      lines.push("", `🌑 ${signText}`, `${formatDateYmdHm(ev.date)}`);
    } else {
      const jst = new Date(ev.date.getTime() + 9 * 60 * 60 * 1000);
      const moonName = FULL_MOON_NAME_BY_MONTH[jst.getUTCMonth() + 1] || "";
      const signText = signJa ? `${signJa}満月` : "満月";
      const nameText = moonName ? `（${moonName}）` : "";
      lines.push("", `🌕 ${signText}${nameText}`, `${formatDateYmdHm(ev.date)}`);
    }
  });

  return lines.filter((x) => x !== null && x !== undefined);
}

module.exports = {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildElementModalityBlock,
  buildKinjitsuBlock,
};
