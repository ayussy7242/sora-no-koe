"use strict";

const { normalizeBodyKey } = require("../../../domain/canonical");
const { normalizeAspectType } = require("../../../domain/aspect/canonical");
const { absAngularDistance, norm360 } = require("../../story/math");
const { createSignHelpers } = require("../../story/signs");
const { bodyGlyph, bodyLabelJa, signGlyph, signLabelJa } = require("../../../presenters/shared/text/tokens");
const { renderRelationPdfBuffer } = require("../../../engine/pdf/relation/render");
const { deriveRelationData } = require("./build_relation_data");
const { buildComparePairs, buildRelationCounts, buildRelationAiInputs } = require("./ai_inputs");
const { buildHouseCounts, computeDominantSigns, computeDominantHouses, computePrimaryHouse } = require("../shared/center_metrics");
const { generateRelationAiTexts } = require("./ai_generate");
const { resolveDisplayNameFromUserDoc } = require("../../../utils/text/display_name");
const { CORE_PLANETS } = require("../../../domain/astro/constants");
const { createStorageClient } = require("../../../utils/infra/gcs_storage");
const { saveGcsFile, getGcsSignedUrl, fileExists } = require("../../../utils/infra/gcs_upload");
const { normalizeCusps, houseNumberForLonCusps, houseNumberForLonWholeSign } = require("../../../domain/astro/houses");
const { RELATION_VIEW_SCHEMA_VERSION } = require("../../../domain/schema/versions");

const DEFAULT_RELATION_BODY_KEYS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "asc",
  "dc",
  "mc",
  "ic",
  "north_node",
  "south_node",
  "chiron",
  "lilith",
];

const DEFAULT_DEEP_POINT_KEYS = [
  "north_node",
  "south_node",
  "chiron",
  "lilith",
];

const DEFAULT_ELEMENT_KEYS = ["fire", "earth", "air", "water"];
const DEFAULT_MODALITY_KEYS = ["cardinal", "fixed", "mutable"];

const AXIS_BODIES = new Set(["asc", "mc", "ic", "dc"]);

const HOUSE_LABELS = {
  1: "自己・起点",
  2: "価値・感覚",
  3: "思考・言語",
  4: "基盤・安心",
  5: "表現・創造",
  6: "習慣・調整",
  7: "対面・関係",
  8: "共有・結束",
  9: "信念・拡張",
  10: "役割・社会",
  11: "交流・共同",
  12: "無意識・背景",
};

const HOUSE_BODY_WEIGHT = {
  sun: 3,
  moon: 3,
  asc: 3,
  mercury: 2,
  venus: 2,
  mars: 2,
  jupiter: 1.5,
  saturn: 1.5,
  uranus: 1,
  neptune: 1,
  pluto: 1,
  north_node: 0.8,
  south_node: 0.8,
  chiron: 0.8,
  lilith: 0.8,
};

const DEFAULT_GAP_PAIRS = new Set([
  "sun_sun",
  "moon_moon",
  "mercury_mercury",
  "mars_mars",
  "venus_mars",
]);

const DEFAULT_GAP_ASPECTS = new Set(["square", "opposition"]);

function normalizePairKey(pairKeyRaw) {
  const raw = String(pairKeyRaw || "").trim();
  if (!raw || !raw.includes("__")) return { ok: false, pairKey: null, ids: [] };
  const parts = raw.split("__").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return { ok: false, pairKey: null, ids: [] };
  const ids = parts.slice().sort();
  return { ok: true, pairKey: `${ids[0]}__${ids[1]}`, ids };
}

function splitPairKey(pairKeyRaw) {
  const raw = String(pairKeyRaw || "").trim();
  if (!raw || !raw.includes("__")) return null;
  const parts = raw.split("__").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return { a: parts[0], b: parts[1] };
}

function buildAspectList(dict) {
  const src = dict?.ASPECTS || dict?.ASPECTS_V2 || dict?.ASPECTS_V1 || null;
  const out = [];
  const fromMajorList = Array.isArray(src?.major_list)
    ? src.major_list.filter((a) => Number.isFinite(Number(a?.deg)))
    : [];
  if (fromMajorList.length) {
    const list = fromMajorList.map((a) => ({ type: normalizeAspectType(a.type || a.key, a.deg), deg: Number(a.deg) }));
    if (!list.some((a) => normalizeAspectType(a.type, a.deg) === "quincunx_150")) list.push({ type: "quincunx_150", deg: 150 });
    return list;
  }

  const major = src?.major || {};
  for (const [k, v] of Object.entries(major)) {
    const deg = Number(v?.deg);
    if (!Number.isFinite(deg)) continue;
    out.push({ type: normalizeAspectType(v?.key || k, deg), deg });
  }
  if (out.length) {
    if (!out.some((a) => normalizeAspectType(a.type, a.deg) === "quincunx_150")) out.push({ type: "quincunx_150", deg: 150 });
    return out;
  }

  return [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
    { type: "quincunx_150", deg: 150 },
  ];
}

function bestAspectForDistance(distDeg, aspectsList) {
  let best = null;
  const list = Array.isArray(aspectsList) ? aspectsList : [];
  for (const a of list) {
    const delta = Math.abs(distDeg - a.deg);
    if (!best || delta < best.delta) best = { type: a.type, aspect_deg: a.deg, delta };
  }
  return best;
}

function pickAxesFromRules(rules, fallbackBodies) {
  const axes = Array.isArray(rules?.axes) ? rules.axes : [];
  if (axes.length) return axes;

  const bodies = Array.isArray(fallbackBodies) && fallbackBodies.length
    ? fallbackBodies
    : DEFAULT_RELATION_BODY_KEYS;

  const out = [];
  for (const a of bodies) {
    for (const b of bodies) {
      out.push(`${a}_${b}`);
    }
  }
  return out;
}

function normalizeAxisPair(pairRaw) {
  const raw = String(pairRaw || "").trim();
  if (!raw) return null;
  const parts = raw.split("_").map((p) => normalizeBodyKey(p)).filter(Boolean);
  if (parts.length !== 2) return null;
  return { a: parts[0], b: parts[1], key: `${parts[0]}_${parts[1]}` };
}

function houseNumberForLon(lon, ascLon, cusps) {
  if (!Number.isFinite(Number(lon))) return null;
  const byCusps = houseNumberForLonCusps(lon, cusps);
  if (Number.isFinite(Number(byCusps))) return byCusps;
  return houseNumberForLonWholeSign(lon, ascLon);
}

function extractRelationLongitudes(natalCacheDoc) {
  const d = natalCacheDoc || {};
  const out = {};

  const put = (key, lon) => {
    const nk = normalizeBodyKey(key);
    if (!nk) return;
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

  if (d.bodies && typeof d.bodies === "object") {
    for (const [k, v] of Object.entries(d.bodies)) putFromObj(k, v);
  }
  if (d.points && typeof d.points === "object") {
    for (const p of ["asc", "mc", "vertex", "ic", "dc"]) {
      if (p in d.points) putFromObj(p, d.points[p]);
    }
  }

  const bodiesMap =
    d?.min?.bodies ||
    d?.min?.natal_positions ||
    d?.natal_positions ||
    d?.positions ||
    null;
  if (bodiesMap && typeof bodiesMap === "object") {
    for (const [k, v] of Object.entries(bodiesMap)) putFromObj(k, v);
  }

  put("asc", d?.engine?.houses?.asc_deg);
  put("mc", d?.engine?.houses?.mc_deg);
  put("asc", d?.houses?.angles?.asc);
  put("mc", d?.houses?.angles?.mc);
  put("vertex", d?.houses?.angles?.vertex);
  put("asc", d?.min?.angles?.asc_deg ?? d?.min?.angles?.asc ?? d?.min?.asc_deg);
  put("mc", d?.min?.angles?.mc_deg ?? d?.min?.angles?.mc ?? d?.min?.mc_deg);
  put("dc", d?.min?.angles?.dc_deg ?? d?.min?.angles?.dc ?? d?.min?.dc_deg);
  put("ic", d?.min?.angles?.ic_deg ?? d?.min?.angles?.ic ?? d?.min?.ic_deg);

  const legacySrc = (d.min && d.min.bodies) || d.bodies_min || d.natal_bodies || null;
  if (legacySrc && typeof legacySrc === "object") {
    for (const [k, v] of Object.entries(legacySrc)) putFromObj(k, v);
  }

  const ok = Object.keys(out).length > 0;
  return { ok, longitudes: out };
}

function extractRelationHouses(natalCacheDoc) {
  const d = natalCacheDoc || {};
  const houses = d?.houses || null;
  const system = houses?.system || d?.engine?.houses?.system || null;
  const cusps = normalizeCusps(houses?.cusps || houses?.cusp || houses?.house || null);
  const angles = houses?.angles || d?.min?.angles || d?.engine?.houses || null;
  const asc =
    angles?.asc ?? angles?.ASC ?? angles?.asc_deg ?? angles?.ASC_deg ??
    d?.min?.asc ?? d?.min?.asc_deg ?? d?.asc ?? d?.ASC ?? null;
  const mc =
    angles?.mc ?? angles?.MC ?? angles?.mc_deg ?? angles?.MC_deg ??
    d?.min?.mc ?? d?.min?.mc_deg ?? d?.mc ?? d?.MC ?? null;
  const vertex =
    angles?.vertex ?? angles?.vertex_deg ?? angles?.VERTEX ?? angles?.VERTEX_deg ??
    d?.min?.vertex ?? d?.min?.vertex_deg ?? null;

  const ok = !!(cusps && cusps.length === 12) || Number.isFinite(Number(asc));
  return {
    ok,
    houses: {
      system: system || null,
      cusps: cusps || null,
      angles: {
        asc: Number.isFinite(Number(asc)) ? Number(asc) : null,
        mc: Number.isFinite(Number(mc)) ? Number(mc) : null,
        vertex: Number.isFinite(Number(vertex)) ? Number(vertex) : null,
      },
    },
  };
}

function buildPlanetMatrix({ longitudes, houses, dict, signFromLon, order = DEFAULT_RELATION_BODY_KEYS }) {
  const ascLon = houses?.angles?.asc ?? longitudes?.asc;
  const cusps = houses?.cusps || null;
  const rows = [];

  for (const body of order) {
    const lon = longitudes?.[body];
    const sign = Number.isFinite(Number(lon)) ? signFromLon(lon) : { sign_key: null, sign_ja: null };
    const signKey = sign?.sign_key || null;
    const house = houseNumberForLon(lon, ascLon, cusps);

    rows.push({
      body_key: body,
      body_ja: bodyLabelJa(dict, body),
      body_glyph: bodyGlyph(body),
      sign_key: signKey,
      sign_ja: sign?.sign_ja || signLabelJa(dict, signKey),
      sign_glyph: signGlyph(signKey),
      house,
      lon_deg: Number.isFinite(Number(lon)) ? Number(lon) : null,
    });
  }

  return rows;
}

function buildHouseIngressAiData({
  ownerPlanets = [],
  guestPlanets = [],
  ownerHouses,
  ownerName = "A",
  guestName = "B",
  maxHouses = 5,
} = {}) {
  const asc = ownerPlanets.find((p) => p?.body_key === "asc");
  const ascLon = ownerHouses?.angles?.asc ?? asc?.lon_deg;
  const cusps = ownerHouses?.cusps || null;
  const heading = `${guestName} → ${ownerName}`;
  if (!Number.isFinite(Number(ascLon))) return { heading, houses: [] };

  const byHouse = new Map();
  const weightByHouse = new Map();
  for (const row of guestPlanets) {
    if (!row?.body_key || !Number.isFinite(Number(row?.lon_deg))) continue;
    if (AXIS_BODIES.has(row.body_key)) continue;
    const house = houseNumberForLon(row.lon_deg, ascLon, cusps);
    if (!Number.isFinite(Number(house))) continue;
    const label = row?.body_ja || row?.body_key || "";
    if (!label) continue;
    if (!byHouse.has(house)) byHouse.set(house, []);
    byHouse.get(house).push(label);
    const key = String(row.body_key || "").toLowerCase();
    const w = HOUSE_BODY_WEIGHT[key] ?? 1;
    weightByHouse.set(house, (weightByHouse.get(house) || 0) + w);
  }

  const houses = Array.from(byHouse.entries())
    .map(([house, bodies]) => ({
      house,
      label: HOUSE_LABELS[house] || "",
      bodies,
      weight: weightByHouse.get(house) || 0,
    }))
    .filter((row) => row.bodies && row.bodies.length)
    .sort((a, b) => (b.weight - a.weight) || (a.house - b.house))
    .slice(0, maxHouses)
    .map(({ house, label, bodies }) => ({ house, label, bodies }));

  return { heading, houses };
}

function computeElementModalityBalance({ longitudes, dict, getSignMetaByKey }) {
  const elementCount = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalityCount = { cardinal: 0, fixed: 0, mutable: 0 };

  const targets = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  for (const body of targets) {
    const lon = longitudes?.[body];
    if (!Number.isFinite(Number(lon))) continue;
    const signKeyFromLon = Math.floor(norm360(lon) / 30);
    const order = dict?.SIGNS?.order || dict?.SIGNS_V2?.order || dict?.SIGNS_V1?.order || [
      "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
    ];
    const key = order?.[signKeyFromLon] || null;
    const meta = getSignMetaByKey ? getSignMetaByKey(key) : null;
    const e = meta?.element || null;
    const m = meta?.modality || null;
    if (e && elementCount[e] !== undefined) elementCount[e] += 1;
    if (m && modalityCount[m] !== undefined) modalityCount[m] += 1;
  }

  const topKey = (obj, keys) => {
    const entries = Object.entries(obj).filter(([k, v]) => keys.includes(k) && v > 0);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  };

  return {
    element_count: elementCount,
    modality_count: modalityCount,
    top_element: topKey(elementCount, DEFAULT_ELEMENT_KEYS),
    top_modality: topKey(modalityCount, DEFAULT_MODALITY_KEYS),
  };
}

function buildConnections({
  aLongitudes,
  bLongitudes,
  aHouses,
  bHouses,
  rules,
  dict,
  signFromLon,
}) {
  const aspectListAll = buildAspectList(dict);
  const allowed = Array.isArray(rules?.aspects_used)
    ? rules.aspects_used.map((v) => normalizeAspectType(String(v || ""))).filter(Boolean)
    : null;
  if (allowed && !allowed.includes("quincunx_150")) allowed.push("quincunx_150");
  const aspectList = allowed && allowed.length
    ? aspectListAll.filter((a) => allowed.includes(normalizeAspectType(a.type, a.deg)))
    : aspectListAll;

  const orbMax = Number(rules?.orb_max_deg ?? 6);
  const axes = pickAxesFromRules(rules, DEFAULT_RELATION_BODY_KEYS);
  const out = [];

  for (const axis of axes) {
    const pair = normalizeAxisPair(axis);
    if (!pair) continue;
    const aLon = aLongitudes?.[pair.a];
    const bLon = bLongitudes?.[pair.b];
    if (!Number.isFinite(Number(aLon)) || !Number.isFinite(Number(bLon))) continue;

    const dist = absAngularDistance(aLon, bLon);
    const best = bestAspectForDistance(dist, aspectList);
    if (!best) continue;
    if (!Number.isFinite(best.delta) || best.delta > orbMax) continue;

    const aSign = signFromLon(aLon);
    const bSign = signFromLon(bLon);
    const aAsc = aHouses?.angles?.asc ?? aLongitudes?.asc;
    const bAsc = bHouses?.angles?.asc ?? bLongitudes?.asc;
    const aHouse = houseNumberForLon(aLon, aAsc, aHouses?.cusps);
    const bHouse = houseNumberForLon(bLon, bAsc, bHouses?.cusps);

    out.push({
      pair: pair.key,
      aspect: best.type,
      aspect_deg: best.aspect_deg,
      orb: Number(best.delta.toFixed(2)),
      a: {
        body_key: pair.a,
        body_ja: bodyLabelJa(dict, pair.a),
        body_glyph: bodyGlyph(pair.a),
        sign_key: aSign.sign_key,
        sign_ja: aSign.sign_ja,
        sign_glyph: signGlyph(aSign.sign_key),
        house: aHouse,
      },
      b: {
        body_key: pair.b,
        body_ja: bodyLabelJa(dict, pair.b),
        body_glyph: bodyGlyph(pair.b),
        sign_key: bSign.sign_key,
        sign_ja: bSign.sign_ja,
        sign_glyph: signGlyph(bSign.sign_key),
        house: bHouse,
      },
    });
  }

  out.sort((x, y) => (x.orb - y.orb) || (x.pair || "").localeCompare(y.pair || ""));
  return out;
}

function buildHouseLinks(connections) {
  const out = [];
  const seen = new Set();
  for (const c of connections || []) {
    const aHouse = Number(c?.a?.house);
    const bHouse = Number(c?.b?.house);
    if (!Number.isFinite(aHouse) || !Number.isFinite(bHouse)) continue;
    const key = `${aHouse}_${bHouse}_${c?.pair || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a_house: aHouse, b_house: bHouse, via: c?.pair || null });
  }
  return out;
}

function buildGaps(connections, rules) {
  const pairs = Array.isArray(rules?.gap_pairs) && rules.gap_pairs.length
    ? new Set(rules.gap_pairs.map((p) => String(p)))
    : DEFAULT_GAP_PAIRS;

  const out = [];
  for (const c of connections || []) {
    const key = String(c?.pair || "");
    if (!pairs.has(key)) continue;
    if (!DEFAULT_GAP_ASPECTS.has(String(c?.aspect || ""))) continue;
    out.push({
      pair: key,
      type: "mismatch",
      aspect: c?.aspect || null,
      orb: c?.orb ?? null,
    });
  }
  return out;
}

function applyViewerOrder(view, viewerId) {
  if (!view || !viewerId) return view;
  const aId = view?.pair_ids?.a_id;
  const bId = view?.pair_ids?.b_id;
  if (!aId || !bId || viewerId === aId) return view;
  if (viewerId !== bId) return view;

  const swapped = {
    ...view,
    pair_ids: { a_id: bId, b_id: aId },
    people: {
      a: view?.people?.b || {},
      b: view?.people?.a || {},
    },
    planet_matrix: {
      a: view?.planet_matrix?.b || [],
      b: view?.planet_matrix?.a || [],
    },
    deep_points: {
      a: view?.deep_points?.b || [],
      b: view?.deep_points?.a || [],
    },
    element_balance: {
      a: view?.element_balance?.b || {},
      b: view?.element_balance?.a || {},
    },
    modality_balance: {
      a: view?.modality_balance?.b || {},
      b: view?.modality_balance?.a || {},
    },
    dominant_signs: {
      a: view?.dominant_signs?.b || [],
      b: view?.dominant_signs?.a || [],
    },
    dominant_houses: {
      a: view?.dominant_houses?.b || [],
      b: view?.dominant_houses?.a || [],
    },
    primary_house: {
      a: view?.primary_house?.b ?? null,
      b: view?.primary_house?.a ?? null,
    },
    house_counts: {
      a: view?.house_counts?.b || {},
      b: view?.house_counts?.a || {},
    },
    connections: Array.isArray(view?.connections)
      ? view.connections.map((c) => ({
          ...c,
          pair: `${c?.b?.body_key || ""}_${c?.a?.body_key || ""}`.replace(/^_+|_+$/g, ""),
          a: c?.b || null,
          b: c?.a || null,
        }))
      : [],
    house_links: Array.isArray(view?.house_links)
      ? view.house_links.map((h) => ({
          a_house: h?.b_house ?? null,
          b_house: h?.a_house ?? null,
          via: h?.via || null,
        }))
      : [],
  };

  swapped.gaps = Array.isArray(view?.gaps)
    ? view.gaps.map((g) => ({
        ...g,
        pair: typeof g?.pair === "string" ? g.pair.split("_").reverse().join("_") : g?.pair,
      }))
    : [];

  if (view?.ai_inputs) {
    const ai = { ...(view.ai_inputs || {}) };
    if (ai?.relation_center && typeof ai.relation_center === "object") {
      ai.relation_center = { ...ai.relation_center };
    }
    if (ai?.relation_core && typeof ai.relation_core === "object") {
      ai.relation_core = { ...ai.relation_core };
    }
    if (ai?.a_center || ai?.b_center) {
      ai.a_center = view?.ai_inputs?.b_center || {};
      ai.b_center = view?.ai_inputs?.a_center || {};
    }
    if (ai?.house_ingress_a || ai?.house_ingress_b) {
      const temp = ai.house_ingress_a;
      ai.house_ingress_a = view?.ai_inputs?.house_ingress_b || {};
      ai.house_ingress_b = temp || {};
    }
    if (Array.isArray(ai?.sign_facing)) {
      ai.sign_facing = ai.sign_facing.map((row) => ({
        ...row,
        a_sign: row?.b_sign ?? row?.a_sign,
        b_sign: row?.a_sign ?? row?.b_sign,
      }));
    }
    swapped.ai_inputs = ai;
  }

  if (view?.ai_texts) {
    const texts = { ...(view.ai_texts || {}) };
    const aLines = texts.house_ingress_a_lines;
    const aSummary = texts.house_ingress_a_summary;
    texts.house_ingress_a_lines = texts.house_ingress_b_lines;
    texts.house_ingress_a_summary = texts.house_ingress_b_summary;
    texts.house_ingress_b_lines = aLines;
    texts.house_ingress_b_summary = aSummary;
    swapped.ai_texts = texts;
  }

  return swapped;
}

function createRelationService({ db, admin, dict, storage, env } = {}) {
  if (!db) throw new Error("createRelationService: db required");
  if (!admin) throw new Error("createRelationService: admin required");
  if (!dict) throw new Error("createRelationService: dict required");

  const { signFromLon, getSignMetaByKey } = createSignHelpers({ SIGNS: dict?.SIGNS, norm360 });

  const bucketName =
    env?.RELATION_PDF_BUCKET ||
    env?.GCS_BUCKET_SORA ||
    env?.GCS_BUCKET_BLUEPRINTS ||
    null;

  const urlExpireDays = Number(env?.RELATION_PDF_URL_EXPIRES_DAYS ?? 7);
  let storageClientPromise = null;
  const getStorageClient = async () => {
    if (!storageClientPromise) storageClientPromise = createStorageClient({ storage, env });
    return storageClientPromise;
  };

  function nowServer() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  async function loadRelationPairDoc(pairKeyRaw) {
    const normalized = normalizePairKey(pairKeyRaw);
    const targetKey = normalized.ok ? normalized.pairKey : null;
    if (!targetKey) return { ok: false, code: "pair_key_invalid" };

    const col = db.collection("relations_pairs");
    let snap = await col.doc(targetKey).get();
    if (!snap.exists && pairKeyRaw && pairKeyRaw !== targetKey) {
      snap = await col.doc(String(pairKeyRaw)).get();
    }

    if (!snap.exists) return { ok: false, code: "pair_not_found", pairKey: targetKey };
    const data = snap.data() || {};
    return { ok: true, pairKey: targetKey, data };
  }

  async function loadNatalCache(appUserId) {
    const snap = await db.collection("natal_cache").doc(appUserId).get();
    return snap.exists ? snap.data() : null;
  }

  async function loadUserDisplayName(appUserId) {
    if (!appUserId) return null;
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return resolveDisplayNameFromUserDoc(data, { preferProfile: true });
  }

  async function upsertRelationsIndex({ pairKey, aId, bId, status }) {
    if (!pairKey || !aId || !bId) return;

    const [nameA, nameB] = await Promise.all([
      loadUserDisplayName(aId),
      loadUserDisplayName(bId),
    ]);

    const now = nowServer();
    const base = {
      pair_key: pairKey,
      updated_at: now,
      status: status || null,
    };

    const aDoc = {
      ...base,
      self_id: aId,
      other_id: bId,
      other_name: nameB || null,
    };
    const bDoc = {
      ...base,
      self_id: bId,
      other_id: aId,
      other_name: nameA || null,
    };

    const col = db.collection("relations_index");
    await Promise.all([
      col.doc(aId).collection("pairs").doc(pairKey).set(aDoc, { merge: true }),
      col.doc(bId).collection("pairs").doc(pairKey).set(bDoc, { merge: true }),
    ]);
  }

  async function buildRelationView({ pairKey }) {
    const normalized = normalizePairKey(pairKey);
    if (!normalized.ok) return { ok: false, code: "pair_key_invalid" };

    const [aId, bId] = normalized.ids;

    const pairDoc = await loadRelationPairDoc(normalized.pairKey);
    const rules = pairDoc?.data?.rules || pairDoc?.data?.rule || null;
    const status = pairDoc?.data?.status || null;

    const [aCache, bCache, nameA, nameB] = await Promise.all([
      loadNatalCache(aId),
      loadNatalCache(bId),
      loadUserDisplayName(aId),
      loadUserDisplayName(bId),
    ]);

    if (!aCache || !bCache) {
      return {
        ok: false,
        code: "natal_cache_missing",
        missing: {
          a: !aCache,
          b: !bCache,
        },
        pairKey: normalized.pairKey,
      };
    }

    const aExtracted = extractRelationLongitudes(aCache);
    const bExtracted = extractRelationLongitudes(bCache);
    if (!aExtracted.ok || !bExtracted.ok) {
      return {
        ok: false,
        code: "natal_cache_invalid",
        missing: {
          a: !aExtracted.ok,
          b: !bExtracted.ok,
        },
        pairKey: normalized.pairKey,
      };
    }

    const aHouses = extractRelationHouses(aCache);
    const bHouses = extractRelationHouses(bCache);

    const planetMatrixA = buildPlanetMatrix({
      longitudes: aExtracted.longitudes,
      houses: aHouses?.houses || null,
      dict,
      signFromLon,
    });
    const planetMatrixB = buildPlanetMatrix({
      longitudes: bExtracted.longitudes,
      houses: bHouses?.houses || null,
      dict,
      signFromLon,
    });
    const deepPointsA = buildPlanetMatrix({
      longitudes: aExtracted.longitudes,
      houses: aHouses?.houses || null,
      dict,
      signFromLon,
      order: DEFAULT_DEEP_POINT_KEYS,
    });
    const deepPointsB = buildPlanetMatrix({
      longitudes: bExtracted.longitudes,
      houses: bHouses?.houses || null,
      dict,
      signFromLon,
      order: DEFAULT_DEEP_POINT_KEYS,
    });

    const balanceA = computeElementModalityBalance({
      longitudes: aExtracted.longitudes,
      dict,
      getSignMetaByKey,
    });
    const balanceB = computeElementModalityBalance({
      longitudes: bExtracted.longitudes,
      dict,
      getSignMetaByKey,
    });

    const connections = buildConnections({
      aLongitudes: aExtracted.longitudes,
      bLongitudes: bExtracted.longitudes,
      aHouses: aHouses?.houses || null,
      bHouses: bHouses?.houses || null,
      rules,
      dict,
      signFromLon,
    });

    const houseLinks = buildHouseLinks(connections);
    const gaps = buildGaps(connections, rules);

    const mainPlanetKeys = new Set(CORE_PLANETS);
    const planetMainA = planetMatrixA.filter((p) => mainPlanetKeys.has(p?.body_key));
    const planetMainB = planetMatrixB.filter((p) => mainPlanetKeys.has(p?.body_key));
    const houseCountsA = buildHouseCounts(planetMainA);
    const houseCountsB = buildHouseCounts(planetMainB);
    const northNodeSignA = deepPointsA.find((p) => p?.body_key === "north_node")?.sign_key || null;
    const northNodeSignB = deepPointsB.find((p) => p?.body_key === "north_node")?.sign_key || null;
    const dominantSignsA = computeDominantSigns({ planets: planetMainA, nodeSignKeys: [northNodeSignA] });
    const dominantSignsB = computeDominantSigns({ planets: planetMainB, nodeSignKeys: [northNodeSignB] });
    const dominantHousesA = computeDominantHouses({ planets: planetMainA, houseCounts: houseCountsA });
    const dominantHousesB = computeDominantHouses({ planets: planetMainB, houseCounts: houseCountsB });
    const buildAngles = (list) => {
      const out = {};
      list.forEach((p) => {
        const key = String(p?.body_key || "").toLowerCase();
        if (!["asc", "mc", "ic", "dc"].includes(key)) return;
        out[key] = { house: p?.house ?? null };
      });
      return out;
    };
    const buildNodesExtras = (list) => {
      const out = { nodes: {}, extras: {} };
      list.forEach((p) => {
        const key = String(p?.body_key || "").toLowerCase();
        if (key === "north_node") out.nodes.north = { house: p?.house ?? null, sign_key: p?.sign_key || null };
        if (key === "south_node") out.nodes.south = { house: p?.house ?? null, sign_key: p?.sign_key || null };
        if (key === "chiron") out.extras.chiron = { house: p?.house ?? null, sign_key: p?.sign_key || null };
        if (key === "lilith") out.extras.lilith = { house: p?.house ?? null, sign_key: p?.sign_key || null };
      });
      return out;
    };
    const aAngles = buildAngles(planetMatrixA);
    const bAngles = buildAngles(planetMatrixB);
    const aNodesExtras = buildNodesExtras(deepPointsA);
    const bNodesExtras = buildNodesExtras(deepPointsB);
    const primaryHouseA = computePrimaryHouse({ planets: planetMainA, angles: aAngles, nodes: aNodesExtras.nodes, extras: aNodesExtras.extras });
    const primaryHouseB = computePrimaryHouse({ planets: planetMainB, angles: bAngles, nodes: bNodesExtras.nodes, extras: bNodesExtras.extras });

    const derived = deriveRelationData({
      people: { a: { name: nameA }, b: { name: nameB } },
      planet_matrix: { a: planetMatrixA, b: planetMatrixB },
      deep_points: { a: deepPointsA, b: deepPointsB },
      houses: {
        a: aHouses?.houses || null,
        b: bHouses?.houses || null,
      },
      element_balance: {
        a: { element_count: balanceA.element_count, top_element: balanceA.top_element },
        b: { element_count: balanceB.element_count, top_element: balanceB.top_element },
      },
      modality_balance: {
        a: { modality_count: balanceA.modality_count, top_modality: balanceA.top_modality },
        b: { modality_count: balanceB.modality_count, top_modality: balanceB.top_modality },
      },
      connections,
    });

    const comparePairs = buildComparePairs({
      aPlanets: planetMatrixA,
      bPlanets: planetMatrixB,
      connections,
    });

    const relationCounts = buildRelationCounts(comparePairs);
    const houseIngressA = buildHouseIngressAiData({
      ownerPlanets: planetMatrixA,
      guestPlanets: planetMatrixB,
      ownerHouses: aHouses?.houses || null,
      ownerName: nameA || "A",
      guestName: nameB || "B",
    });
    const houseIngressB = buildHouseIngressAiData({
      ownerPlanets: planetMatrixB,
      guestPlanets: planetMatrixA,
      ownerHouses: bHouses?.houses || null,
      ownerName: nameB || "B",
      guestName: nameA || "A",
    });

    const summarizeLinks = (list = []) =>
      list.slice(0, 4).map((c) => ({
        a: c?.a?.body_ja || c?.a?.body_key || "—",
        b: c?.b?.body_ja || c?.b?.body_key || "—",
        aspect: c?.aspect || "",
        orb: c?.orb ?? null,
      }));

    const summarizeCompare = (rows = []) =>
      rows.slice(0, 6).map((row) => ({
        body: row?.body_ja || row?.body_key || "—",
        a_sign: row?.a?.sign_ja || row?.a?.sign_key || "—",
        b_sign: row?.b?.sign_ja || row?.b?.sign_key || "—",
        a_house: Number.isFinite(Number(row?.a?.house)) ? `${row.a.house}H` : "",
        b_house: Number.isFinite(Number(row?.b?.house)) ? `${row.b.house}H` : "",
        aspect: row?.aspect || "",
      }));

    const compareIndex = new Map(comparePairs.map((row) => [row?.body_key, row]));
    const pickCompare = (keys) => keys.map((k) => compareIndex.get(k)).filter(Boolean);
    const personalCompare = pickCompare(["sun", "moon", "mercury", "venus", "mars"]);
    const socialCompare = pickCompare(["jupiter", "saturn"]);
    const transpersonalCompare = pickCompare(["uranus", "neptune", "pluto"]);
    const axisCompare = pickCompare(["asc", "dc", "mc", "ic"]);
    const deepCompare = pickCompare(["north_node", "south_node", "lilith", "chiron"]);

    const elementModalityInput = {
      a: {
        top_element: balanceA.top_element,
        top_modality: balanceA.top_modality,
        element_count: balanceA.element_count,
        modality_count: balanceA.modality_count,
      },
      b: {
        top_element: balanceB.top_element,
        top_modality: balanceB.top_modality,
        element_count: balanceB.element_count,
        modality_count: balanceB.modality_count,
      },
    };

    const aiInputs = buildRelationAiInputs({
      relation_center: derived?.relationCenter || {},
      relation_core: derived?.relationCore || {},
      relation_pattern: {
        name: derived?.relationPattern?.name || "",
        type: derived?.relationPattern?.key || "",
        summary: "",
      },
      pattern_evidence: derived?.relationPattern?.evidence || [],
      a_center: {
        dominant_signs: dominantSignsA,
        dominant_houses: dominantHousesA,
        element_balance: balanceA.element_count,
        modality_balance: balanceA.modality_count,
      },
      b_center: {
        dominant_signs: dominantSignsB,
        dominant_houses: dominantHousesB,
        element_balance: balanceB.element_count,
        modality_balance: balanceB.modality_count,
      },
      element_modality: elementModalityInput,
      sign_facing: comparePairs.map((row) => ({
        body: row.body_ja || row.body_key,
        a_sign: row.a_sign,
        b_sign: row.b_sign,
        relation_type: row.relation_type,
      })),
      relation_counts: relationCounts,
      core_links: derived?.coreList ? derived.coreList.slice(0, 3).map((c) => ({
        a: c?.a?.body_ja || c?.a?.body_key,
        b: c?.b?.body_ja || c?.b?.body_key,
        aspect: c?.aspect,
        orb: c?.orb,
      })) : [],
      flow: { count: derived?.flowList?.length || 0, top_aspects: [], dominant_bodies: [] },
      friction: { count: derived?.frictionList?.length || 0, top_aspects: [], dominant_bodies: [] },
      axis: { count: derived?.axisList?.length || 0, top_links: summarizeLinks(derived?.axisList || []) },
      deep: { count: derived?.deepList?.length || 0, top_links: summarizeLinks(derived?.deepList || []) },
      personal: { count: personalCompare.length, rows: summarizeCompare(personalCompare) },
      social: { count: socialCompare.length, rows: summarizeCompare(socialCompare) },
      transpersonal: { count: transpersonalCompare.length, rows: summarizeCompare(transpersonalCompare) },
      axis_compare: { count: axisCompare.length, rows: summarizeCompare(axisCompare) },
      deep_compare: { count: deepCompare.length, rows: summarizeCompare(deepCompare) },
      comm: { count: derived?.commList?.length || 0, top_links: summarizeLinks(derived?.commList || []) },
      attraction: { count: derived?.attractionList?.length || 0, top_links: summarizeLinks(derived?.attractionList || []) },
      house_ingress_a: houseIngressA,
      house_ingress_b: houseIngressB,
    });

    const view = {
      pair_key: normalized.pairKey,
      pair_ids: { a_id: aId, b_id: bId },
      people: {
        a: {
          name: nameA || null,
          birth: aCache?.birth || null,
        },
        b: {
          name: nameB || null,
          birth: bCache?.birth || null,
        },
      },
      planet_matrix: { a: planetMatrixA, b: planetMatrixB },
      deep_points: { a: deepPointsA, b: deepPointsB },
      element_balance: {
        a: { element_count: balanceA.element_count, top_element: balanceA.top_element },
        b: { element_count: balanceB.element_count, top_element: balanceB.top_element },
      },
      modality_balance: {
        a: { modality_count: balanceA.modality_count, top_modality: balanceA.top_modality },
        b: { modality_count: balanceB.modality_count, top_modality: balanceB.top_modality },
      },
      dominant_signs: { a: dominantSignsA, b: dominantSignsB },
      dominant_houses: { a: dominantHousesA, b: dominantHousesB },
      primary_house: { a: primaryHouseA, b: primaryHouseB },
      house_counts: { a: houseCountsA, b: houseCountsB },
      connections,
      house_links: houseLinks,
      gaps,
      rules: rules || null,
      ai_inputs: aiInputs,
      ai_texts: {},
      ai_meta: {},
      status: status || null,
      schema_version: RELATION_VIEW_SCHEMA_VERSION,
      updated_at: nowServer(),
    };

    const aiEnabledRaw = env?.RELATION_AI_ENABLED ?? process.env.RELATION_AI_ENABLED ?? "";
    const aiEnabled = ["1", "true", "yes", "on"].includes(String(aiEnabledRaw).toLowerCase());
    if (aiEnabled && view.ai_inputs) {
      try {
        const aiResult = await generateRelationAiTexts({ env, aiInputs: view.ai_inputs });
        if (aiResult?.ok && aiResult?.texts) {
          view.ai_texts = aiResult.texts;
          view.ai_meta = aiResult.meta || {};
        }
      } catch (e) {
        console.log("[relation_ai] generate failed:", e?.message || String(e));
      }
    }

    return { ok: true, view };
  }

  async function saveRelationView(pairKey, view) {
    if (!pairKey || !view) return { ok: false, code: "missing_input" };
    const ref = db.collection("relation_view").doc(pairKey);
    await ref.set({ ...view, updated_at: nowServer() }, { merge: true });
    return { ok: true };
  }

  async function getRelationView({ pairKey, viewerId, forceRegen = false } = {}) {
    const normalized = normalizePairKey(pairKey);
    if (!normalized.ok) return { ok: false, code: "pair_key_invalid" };

    const ref = db.collection("relation_view").doc(normalized.pairKey);
    const snap = await ref.get();
    if (snap.exists && !forceRegen) {
      const view = snap.data() || {};
      const aBodies = Array.isArray(view?.planet_matrix?.a) ? view.planet_matrix.a : [];
      const hasDc = aBodies.some((p) => p?.body_key === "dc");
      const hasIc = aBodies.some((p) => p?.body_key === "ic");
      const hasPeople = !!(view?.people?.a || view?.people?.b);
      if (hasDc && hasIc && hasPeople) {
        return { ok: true, view: applyViewerOrder(view, viewerId) };
      }
    }

    const built = await buildRelationView({ pairKey: normalized.pairKey });
    if (!built.ok) return built;

    await saveRelationView(normalized.pairKey, built.view);
    await upsertRelationsIndex({
      pairKey: normalized.pairKey,
      aId: built.view?.pair_ids?.a_id,
      bId: built.view?.pair_ids?.b_id,
      status: built.view?.status || null,
    });

    return { ok: true, view: applyViewerOrder(built.view, viewerId) };
  }

  function getRelationPdfPath(pairKey, viewerId) {
    const normalized = normalizePairKey(pairKey);
    const safePair = String(normalized?.pairKey || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const safeViewer = String(viewerId || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
    if (!safePair || !safeViewer) return null;
    return `relations/pdf/${safePair}/${safeViewer}.pdf`;
  }

  async function getRelationPdfSignedUrl(pairKey, viewerId) {
    const storageClient = await getStorageClient();
    if (!storageClient || !bucketName) return { ok: false, code: "storage_missing" };
    const path = getRelationPdfPath(pairKey, viewerId);
    if (!path) return { ok: false, code: "path_invalid" };
    const exists = await fileExists({ storage: storageClient, bucketName, path });
    if (!exists.exists) return { ok: false, code: "not_ready" };
    try {
      const signed = await getGcsSignedUrl({ storage: storageClient, bucketName, path, expiresDays: urlExpireDays });
      return { ok: true, url: signed.url };
    } catch (e) {
      return { ok: false, code: "signing_failed", error: String(e?.message || e) };
    }
  }

  async function saveRelationPdfBuffer(pairKey, viewerId, buffer) {
    const storageClient = await getStorageClient();
    if (!storageClient || !bucketName) return { ok: false, code: "storage_missing" };
    const path = getRelationPdfPath(pairKey, viewerId);
    if (!path) return { ok: false, code: "path_invalid" };
    await saveGcsFile({
      storage: storageClient,
      bucketName,
      path,
      buffer,
      contentType: "application/pdf",
      cacheControl: "private, max-age=0, no-transform",
    });
    return { ok: true, filePath: path };
  }

  async function listRelationsIndex({ appUserId, limit = 20 } = {}) {
    if (!appUserId) return [];
    const snap = await db
      .collection("relations_index")
      .doc(appUserId)
      .collection("pairs")
      .orderBy("updated_at", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  }

  async function getOrCreateRelationPdf({ pairKey, viewerId, forceRegen = false } = {}) {
    if (!pairKey || !viewerId) return { ok: false, code: "missing_input" };

    if (!forceRegen) {
      const signed = await getRelationPdfSignedUrl(pairKey, viewerId);
      if (signed?.ok && signed?.url) return signed;
    }

    const viewResult = await getRelationView({ pairKey, viewerId, forceRegen: forceRegen });
    if (!viewResult?.ok) return viewResult;

    const pdfBuffer = await renderRelationPdfBuffer({ view: viewResult.view });
    const saved = await saveRelationPdfBuffer(pairKey, viewerId, pdfBuffer);
    if (!saved?.ok) return saved;

    return await getRelationPdfSignedUrl(pairKey, viewerId);
  }

  return {
    normalizePairKey,
    splitPairKey,
    applyViewerOrder,
    buildRelationView,
    getRelationView,
    saveRelationView,
    listRelationsIndex,
    getRelationPdfSignedUrl,
    saveRelationPdfBuffer,
    getOrCreateRelationPdf,
  };
}

module.exports = {
  createRelationService,
  normalizePairKey,
  splitPairKey,
  applyViewerOrder,
};
