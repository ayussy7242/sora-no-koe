"use strict";

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
}

function pickBirthFromUser(user) {
  const b = user?.natal?.birth || {};
  if (!b.date_local || !b.time_hm) return null;
  return {
    date_local: b.date_local,
    time_hm: b.time_hm,
    timezone: b.timezone || "Asia/Tokyo",
    lat: typeof b.lat === "number" ? b.lat : null,
    lon: typeof b.lon === "number" ? b.lon : null,
    place_text: b.place_text || null,
    place_formatted: b.place_formatted || null,
    place_id: b.place_id || null,
  };
}

function pickBirthFromCache(cache) {
  const b = cache?.birth || {};
  if (!b.date_local || !b.time_hm) return null;
  return {
    date_local: b.date_local,
    time_hm: b.time_hm,
    timezone: b.timezone || "Asia/Tokyo",
    lat: typeof b.lat === "number" ? b.lat : null,
    lon: typeof b.lon === "number" ? b.lon : null,
    place_text: b.place_text || null,
    place_formatted: b.place_formatted || null,
    place_id: b.place_id || null,
  };
}

(async () => {
  const projectId = getArg("project_id") || process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("Missing project id");

  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = getFirestore(admin.app(), "sora-no-koe-db");

  const cacheSnap = await db.collection("natal_cache").get();
  const usersSnap = await db.collection("users").get();
  let total = 0;
  let queued = 0;
  let skipped = 0;
  const queuedIds = new Set();

  for (const doc of cacheSnap.docs) {
    total += 1;
    const appUserId = doc.id;
    const cache = doc.data() || {};
    const birth = pickBirthFromCache(cache);
    if (!birth) {
      skipped += 1;
      continue;
    }

    await db.collection("jobs_natal_calc").doc(appUserId).set(
      {
        status: "queued",
        attempts: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        app_user_id: appUserId,
        birth,
      },
      { merge: true }
    );
    queued += 1;
    queuedIds.add(appUserId);
  }

  for (const doc of usersSnap.docs) {
    total += 1;
    const appUserId = doc.id;
    if (queuedIds.has(appUserId)) continue;
    const user = doc.data() || {};
    const birth = pickBirthFromUser(user);
    if (!birth) {
      skipped += 1;
      continue;
    }

    await db.collection("jobs_natal_calc").doc(appUserId).set(
      {
        status: "queued",
        attempts: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        app_user_id: appUserId,
        birth,
      },
      { merge: true }
    );
    queued += 1;
  }

  console.log("✅ enqueue_natal_jobs_all done");
  console.log("total scanned:", total, "queued:", queued, "skipped(no birth):", skipped);
})();
