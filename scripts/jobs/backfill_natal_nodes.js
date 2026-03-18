#!/usr/bin/env node
"use strict";

const swisseph = require("swisseph");
const { admin, getDb } = require("../../src/integrations/firebase/firebase");
const { processOneNatalJob } = require("../../src/runners/jobs/worker");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function toBool(v, fallback = false) {
  if (v == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
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

function hasNorthNode(cache) {
  const b = cache?.min?.bodies || {};
  return (
    b.north_node != null ||
    b.North_Node != null ||
    b.northNode != null ||
    b.mean_node != null ||
    b.true_node != null ||
    b.node != null
  );
}

(async () => {
  const limit = Number(getArg("limit", "0")) || 0;
  const force = toBool(getArg("force", ""), false);
  const dryRun = toBool(getArg("dry_run", ""), false);

  const db = getDb();

  let processed = 0;
  let skipped = 0;
  let total = 0;

  const env = { ...(process.env || {}), WORKER_PUSH_NATAL_RESULT: "0" };

  const cacheSnap = await db.collection("natal_cache").get();
  const usersSnap = await db.collection("users").get();
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
    if (!force && hasNorthNode(cache)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      processed += 1;
      queuedIds.add(appUserId);
      if (limit && processed >= limit) break;
      continue;
    }

    await processOneNatalJob(
      { db, admin, swisseph, env },
      { job: { app_user_id: appUserId, birth }, job_id: appUserId }
    );
    processed += 1;
    queuedIds.add(appUserId);

    if (limit && processed >= limit) break;
  }

  if (!limit || processed < limit) {
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

      if (dryRun) {
        processed += 1;
        if (limit && processed >= limit) break;
        continue;
      }

      await processOneNatalJob(
        { db, admin, swisseph, env },
        { job: { app_user_id: appUserId, birth }, job_id: appUserId }
      );
      processed += 1;

      if (limit && processed >= limit) break;
    }
  }

  console.log("✅ backfill_natal_nodes done");
  console.log("total scanned:", total, "processed:", processed, "skipped:", skipped, "force:", force, "dry_run:", dryRun);
})();
