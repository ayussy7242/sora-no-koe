"use strict";

require("../_load_env");

const crypto = require("crypto");
const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const env = require("../../src/config/env");
const { createRelationService } = require("../../src/usecases/relations");
const { createGeocoder } = require("../../src/integrations/geocode");
const { Storage } = require("@google-cloud/storage");
const { processOneNatalJob } = require("../../src/runners/jobs/worker");
const swisseph = require("swisseph");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
}

function toNum(v, name) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function normalizeDateLocal(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("date_local must be YYYY-MM-DD");
  }
  return s;
}

function normalizeTimeHm(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (s === "不明" || s.toLowerCase() === "unknown") return "12:00";
  if (!/^\d{2}:\d{2}$/.test(s)) {
    throw new Error("time_hm must be HH:MM (24h) or 不明");
  }
  return s;
}

function newRelationUserId() {
  return `u_rel_${crypto.randomBytes(10).toString("hex")}`;
}

(async () => {
  const ownerAppUserId = getArg("owner_app_user_id") || env.OWNER_APP_USER_ID;
  if (!ownerAppUserId) throw new Error("Missing --owner_app_user_id or OWNER_APP_USER_ID in env");

  const partnerAppUserId = getArg("partner_app_user_id") || newRelationUserId();
  const name = requireArg("name");
  const dateLocal = normalizeDateLocal(requireArg("date_local"));
  const timeHm = normalizeTimeHm(requireArg("time_hm"));
  const timezone = getArg("timezone") || env.DEFAULT_TZ || "Asia/Tokyo";
  const placeText = requireArg("place_text");
  const calcNow = String(getArg("calc") || "").toLowerCase() === "true" || String(getArg("calc") || "") === "1";

  let lat = toNum(getArg("lat"), "lat");
  let lon = toNum(getArg("lon"), "lon");

  const db = getDb();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (lat == null || lon == null) {
    const geocoder = createGeocoder({
      apiKey: env.GOOGLE_MAPS_API_KEY,
      db,
      project: env.PROJECT,
      cacheCollection: env.GEO_CACHE_COLLECTION || "geo_cache",
      cacheTtlDays: Number(env.GEO_CACHE_TTL_DAYS || 180),
      defaultLanguage: env.GEO_DEFAULT_LANGUAGE || "ja",
      defaultRegion: env.GEO_DEFAULT_REGION || "jp",
      strict: false,
    });
    const geo = await geocoder.geocodePlace(placeText, { language: "ja", region: "jp" });
    if (!geo?.ok) {
      throw new Error("Geocode failed. Provide --lat and --lon or a valid place_text.");
    }
    lat = geo.lat;
    lon = geo.lon;
  }

  const birth = {
    date_local: dateLocal,
    time_hm: timeHm,
    timezone,
    lat,
    lon,
    place_text: placeText,
    place_formatted: null,
    place_id: null,
  };

  await db.collection("users").doc(partnerAppUserId).set(
    {
      status: "active",
      profile: { display_name: name, timezone },
      channels: { line: null, email: null },
      natal: { birth, enabled: true },
      relation_owner_app_user_id: ownerAppUserId,
      created_at: now,
      updated_at: now,
    },
    { merge: true }
  );

  await db.collection("jobs_natal_calc").doc(partnerAppUserId).set(
    {
      status: "queued",
      attempts: 0,
      created_at: now,
      updated_at: now,
      app_user_id: partnerAppUserId,
      birth,
    },
    { merge: true }
  );

  const relationService = createRelationService({
    db,
    admin,
    dict: require("../../src/content/dict"),
    storage: new Storage(),
    env,
  });

  const normalized = relationService.normalizePairKey(`${ownerAppUserId}__${partnerAppUserId}`);
  const pairKey = normalized?.pairKey || `${ownerAppUserId}__${partnerAppUserId}`;
  const memberIds = Array.isArray(normalized?.ids) && normalized.ids.length === 2
    ? { a_id: normalized.ids[0], b_id: normalized.ids[1] }
    : { a_id: ownerAppUserId, b_id: partnerAppUserId };

  await db.collection("relations_pairs").doc(pairKey).set(
    {
      pair_key: pairKey,
      members: memberIds,
      rules: {
        aspects_used: ["conjunction", "sextile", "square", "trine", "opposition"],
        orb_max_deg: 8,
      },
      status: { is_valid: false, missing: ["b_min_bodies"], reason: "natal_calc_pending" },
      schema_version: "1.1.0",
      updated_at: now,
    },
    { merge: true }
  );

  const loadDisplayName = async (appUserId) => {
    const snap = await db.collection("users").doc(appUserId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return data?.profile?.display_name || data?.display_name || null;
  };

  const [nameA, nameB] = await Promise.all([
    loadDisplayName(memberIds.a_id),
    loadDisplayName(memberIds.b_id),
  ]);

  const base = { pair_key: pairKey, updated_at: now, status: null };
  await Promise.all([
    db.collection("relations_index").doc(memberIds.a_id).collection("pairs").doc(pairKey).set(
      { ...base, self_id: memberIds.a_id, other_id: memberIds.b_id, other_name: nameB || null },
      { merge: true }
    ),
    db.collection("relations_index").doc(memberIds.b_id).collection("pairs").doc(pairKey).set(
      { ...base, self_id: memberIds.b_id, other_id: memberIds.a_id, other_name: nameA || null },
      { merge: true }
    ),
  ]);

  if (calcNow) {
    const job = (await db.collection("jobs_natal_calc").doc(partnerAppUserId).get()).data();
    await processOneNatalJob({ db, admin, swisseph, env: process.env }, { job, job_id: partnerAppUserId });
  }

  console.log("✅ relation partner registered");
  console.log("owner_app_user_id:", ownerAppUserId);
  console.log("partner_app_user_id:", partnerAppUserId);
  console.log("pair_key:", pairKey);
})();
