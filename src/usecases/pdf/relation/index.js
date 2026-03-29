"use strict";

const { normalizeBodyKey } = require("../../../domain/canonical");
const { absAngularDistance, norm360 } = require("../../story/story_math");
const { createSignHelpers } = require("../../story/story_signs");
const { bodyGlyph, bodyLabelJa, signGlyph, signLabelJa } = require("../../../presenters/shared/text/tokens");
const { renderRelationPdfBuffer } = require("../../../engine/pdf/relation/render");
const { resolveDisplayNameFromUserDoc } = require("../../../utils/resolve_display_name");

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
];

const DEFAULT_DEEP_POINT_KEYS = [
  "north_node",
  "south_node",
  "chiron",
  "lilith",
];

const DEFAULT_ELEMENT_KEYS = ["fire", "earth", "air", "water"];
const DEFAULT_MODALITY_KEYS = ["cardinal", "fixed", "mutable"];

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
  if (fromMajorList.length) return fromMajorList.map((a) => ({ type: a.type || a.key, deg: Number(a.deg) }));

  const major = src?.major || {};
  for (const [k, v] of Object.entries(major)) {
    const deg = Number(v?.deg);
    if (!Number.isFinite(deg)) continue;
    out.push({ type: v?.key || k, deg });
  }
  if (out.length) return out;

  return [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
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

function houseNumberForLon(lon, ascLon) {
  if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(ascLon))) return null;
  const signIndex = Math.floor(norm360(lon) / 30);
  const ascIndex = Math.floor(norm360(ascLon) / 30);
  return ((signIndex - ascIndex + 12) % 12) + 1;
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

function buildPlanetMatrix({ longitudes, dict, signFromLon, order = DEFAULT_RELATION_BODY_KEYS }) {
  const ascLon = longitudes?.asc;
  const rows = [];

  for (const body of order) {
    const lon = longitudes?.[body];
    const sign = Number.isFinite(Number(lon)) ? signFromLon(lon) : { sign_key: null, sign_ja: null };
    const signKey = sign?.sign_key || null;
    const house = houseNumberForLon(lon, ascLon);

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
  rules,
  dict,
  signFromLon,
}) {
  const aspectListAll = buildAspectList(dict);
  const allowed = Array.isArray(rules?.aspects_used) ? rules.aspects_used.map((v) => String(v)) : null;
  const aspectList = allowed && allowed.length
    ? aspectListAll.filter((a) => allowed.includes(a.type))
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
    const aHouse = houseNumberForLon(aLon, aLongitudes?.asc);
    const bHouse = houseNumberForLon(bLon, bLongitudes?.asc);

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

    const planetMatrixA = buildPlanetMatrix({
      longitudes: aExtracted.longitudes,
      dict,
      signFromLon,
    });
    const planetMatrixB = buildPlanetMatrix({
      longitudes: bExtracted.longitudes,
      dict,
      signFromLon,
    });
    const deepPointsA = buildPlanetMatrix({
      longitudes: aExtracted.longitudes,
      dict,
      signFromLon,
      order: DEFAULT_DEEP_POINT_KEYS,
    });
    const deepPointsB = buildPlanetMatrix({
      longitudes: bExtracted.longitudes,
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
      rules,
      dict,
      signFromLon,
    });

    const houseLinks = buildHouseLinks(connections);
    const gaps = buildGaps(connections, rules);

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
      connections,
      house_links: houseLinks,
      gaps,
      rules: rules || null,
      status: status || null,
      schema_version: "relation_view_v1",
      updated_at: nowServer(),
    };

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
    if (!storage || !bucketName) return { ok: false, code: "storage_missing" };
    const path = getRelationPdfPath(pairKey, viewerId);
    if (!path) return { ok: false, code: "path_invalid" };
    const file = storage.bucket(bucketName).file(path);
    const [exists] = await file.exists();
    if (!exists) return { ok: false, code: "not_ready" };
    const expiresMs = urlExpireDays * 24 * 60 * 60 * 1000;
    try {
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + expiresMs,
        version: "v4",
      });
      return { ok: true, url };
    } catch (e) {
      return { ok: false, code: "signing_failed", error: String(e?.message || e) };
    }
  }

  async function saveRelationPdfBuffer(pairKey, viewerId, buffer) {
    if (!storage || !bucketName) return { ok: false, code: "storage_missing" };
    const path = getRelationPdfPath(pairKey, viewerId);
    if (!path) return { ok: false, code: "path_invalid" };
    const file = storage.bucket(bucketName).file(path);
    await file.save(buffer, {
      contentType: "application/pdf",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
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
