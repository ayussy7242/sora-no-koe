"use strict";

const { admin, getDb } = require("../src/integrations/firebase/firebase");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function toNum(v, name) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

function requireArg(name) {
  const v = getArg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
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
  if (!/^\d{2}:\d{2}$/.test(s)) {
    throw new Error("time_hm must be HH:MM (24h)");
  }
  return s;
}

function pickKnownLatLon(placeText) {
  const t = String(placeText || "").toLowerCase();
  if (t.includes("sapporo") || t.includes("札幌")) {
    return { lat: 43.0618, lon: 141.3545 };
  }
  return null;
}

(async () => {
  const lineUserId = requireArg("line_user_id");
  const appUserId = getArg("app_user_id") || `u_test_${Date.now().toString(36)}`;
  const dateLocal = normalizeDateLocal(requireArg("date_local"));
  const timeHm = normalizeTimeHm(requireArg("time_hm"));
  const timezone = getArg("timezone") || "Asia/Tokyo";
  const placeText = getArg("place_text") || "Sapporo, Hokkaido, Japan";

  let lat = toNum(getArg("lat"), "lat");
  let lon = toNum(getArg("lon"), "lon");
  if (lat == null || lon == null) {
    const known = pickKnownLatLon(placeText);
    if (known) {
      lat = known.lat;
      lon = known.lon;
    }
  }
  if (lat == null || lon == null) {
    throw new Error("lat/lon required (or use place_text=Sapporo to auto-fill)");
  }

  const purchased = String(getArg("purchased") || "") === "true";

  const db = getDb();
  const now = admin.firestore.FieldValue.serverTimestamp();

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

  await db.collection("users").doc(appUserId).set(
    {
      status: "active",
      profile: { display_name: "TEST USER", timezone },
      channels: { line: { line_user_id: lineUserId, linked_at: now } },
      natal: { birth, enabled: true },
      created_at: now,
      updated_at: now,
    },
    { merge: true }
  );

  const lineUserPatch = {
    line_user_id: lineUserId,
    app_user_id: appUserId,
    state: "ready",
    is_active: true,
    line_profile: {
      display_name: "TEST USER",
      language: "ja",
      picture_url: null,
      line_user_id: lineUserId,
    },
    created_at: now,
    updated_at: now,
  };
  if (purchased) lineUserPatch.purchases = { blueprint_light: { purchased: true } };

  await db.collection("line_users").doc(lineUserId).set(lineUserPatch, { merge: true });

  await db.collection("jobs_natal_calc").doc(appUserId).set(
    {
      status: "queued",
      attempts: 0,
      created_at: now,
      updated_at: now,
      app_user_id: appUserId,
      birth,
    },
    { merge: true }
  );

  console.log("✅ test user created");
  console.log("line_user_id:", lineUserId);
  console.log("app_user_id:", appUserId);
  console.log("birth:", birth);
})();
