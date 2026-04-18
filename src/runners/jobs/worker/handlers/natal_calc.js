"use strict";

const { createRenderers } = require("../../../../presenters/shared/text");
const dict = require("../../../../content/dict");
const { enqueueBlueprintGenerate } = require("../../../../integrations/cloudtasks/tasks_queue");
const { setLineUserBlueprintPhase, setLineUserNatalPhase } = require("../../../../integrations/line/state");
const { BLUEPRINT_PHASE, NATAL_PHASE } = require("../../../../domain/lifecycle/enums");
const { norm360 } = require("../../../../domain/astro/angles");
const {
  randomId,
  toFixedPrecision,
  isFiniteNumber,
  sha256Hex,
  deepClone,
  birthUtcIsoFromJob,
} = require("../utils");
const { linePush } = require("../notify");
const {
  computeNatalCache,
  housesLooksValid,
  housesStructLooksValid,
  minBodiesLooksValid,
  minAnglesLooksValid,
} = require("../natal");

const { renderNatalListFromcache } = createRenderers({ dict });

/**
 * ✅ 中核：1つのnatal jobを処理して natal_cache を更新する
 * - cron/worker だけじゃなく LINE側の「即時1回キック」にも使える
 */
async function processOneNatalJob(deps = {}, opts = {}) {
  const { db, admin, swisseph } = deps;

  if (!db) throw new Error("deps.db required");
  if (!admin) throw new Error("deps.admin required");
  if (!swisseph) throw new Error("deps.swisseph required");

  // env参照はここに統一（process.env + deps.env）
  const env2 = { ...(deps.env || {}), ...(process.env || {}) };

  const DEBUG_HOUSES = String(env2.DEBUG_HOUSES || "0") === "1";

  const HOUSE_SYSTEM = String(env2.NATAL_HOUSE_SYSTEM || "P");
  const PRECISION_DEG = Number(env2.NATAL_PRECISION_DEG || 0.01);

  // calc version（“同一birth”でも、計算方法が変わったら再計算したい）
  const HOUSES_CALC_VERSION = String(env2.NATAL_HOUSES_CALC_VERSION || "2026-01-04-a");

  // worker id（cron/LINEどちらから呼ばれても識別）
  const WORKER_ID = String(env2.K_REVISION || "")
    ? `cr-${env2.K_REVISION}-${randomId(6)}`
    : `local-${randomId(6)}`;

  const job = opts.job;
  const jobId = opts.job_id || null;
  if (!job || typeof job !== "object") throw new Error("processOneNatalJob requires opts.job");

  const appUserId = job.app_user_id;
  if (!appUserId) throw new Error("job.app_user_id missing");

  const userSnap = await db.collection("users").doc(appUserId).get();
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const lineUserId = user?.channels?.line?.line_user_id || null;

  if (lineUserId) {
    await setLineUserNatalPhase({
      db,
      admin,
      lineUserId,
      phase: NATAL_PHASE.RUNNING_NATAL_CALC,
      eventType: "natal_calc_running",
    });
  }

  const birth = job.birth || {};
  const lat = isFiniteNumber(birth.lat) ? birth.lat : (isFiniteNumber(job.lat) ? job.lat : null);
  const lon = isFiniteNumber(birth.lon) ? birth.lon : (isFiniteNumber(job.lon) ? job.lon : null);

  const birthUtcIso = birthUtcIsoFromJob(job);
  if (!birthUtcIso) {
    throw new Error(
      "birth_utc_iso missing (or timezone not supported). Provide job.birth_utc_iso or Asia/Tokyo date_local+time_hm."
    );
  }

  const dateLocal = birth.date_local || job.date_local || null;
  const timeHm = birth.time_hm || job.time_hm || null;
  const timezone = birth.timezone || job.timezone || null;

  const place_text = birth.place_text || job.place_text || null;
  const place_formatted = birth.place_formatted || job.place_formatted || null;
  const place_id = birth.place_id || job.place_id || null;

  // birth_hash（同一出生の安定キー）
  const birthHash = sha256Hex(JSON.stringify({
    date_local: dateLocal,
    time_hm: timeHm,
    timezone,
    lat,
    lon,
    place_id,
  }));

  const calc = computeNatalCache({
    swisseph,
    birthUtcIso,
    houseSystem: HOUSE_SYSTEM,
    lat,
    lon,
    precisionDeg: PRECISION_DEG,
    debug: DEBUG_HOUSES,
  });

  const cacheRef = db.collection("natal_cache").doc(appUserId);
  const cacheSnap = await cacheRef.get();
  const existing = cacheSnap.exists ? (cacheSnap.data() || {}) : {};

  const sameBirth = !!(existing?.birth_hash && existing.birth_hash === birthHash);

  const existingEngineHousesOk =
    sameBirth &&
    existing?.engine?.houses_calc_version === HOUSES_CALC_VERSION &&
    housesLooksValid(existing?.engine?.houses);

  const existingHousesOk =
    sameBirth &&
    housesStructLooksValid(existing?.houses);

  const existingMinBodiesOk =
    sameBirth &&
    existing?.min?.bodies &&
    typeof existing.min.bodies === "object" &&
    minBodiesLooksValid(existing.min.bodies) &&
    existing?.engine?.ephemeris_source === "swisseph" &&
    Number(existing?.engine?.precision_deg) === Number(PRECISION_DEG);

  const existingMinAnglesOk =
    sameBirth &&
    minAnglesLooksValid(existing?.min?.angles);

  const ascDeg =
    (calc?.houses?.angles && isFiniteNumber(calc.houses.angles.asc)) ? calc.houses.angles.asc :
      (calc?.engineHouses && isFiniteNumber(calc.engineHouses.asc_deg)) ? calc.engineHouses.asc_deg :
        null;

  const mcDeg =
    (calc?.houses?.angles && isFiniteNumber(calc.houses.angles.mc)) ? calc.houses.angles.mc :
      (calc?.engineHouses && isFiniteNumber(calc.engineHouses.mc_deg)) ? calc.engineHouses.mc_deg :
        null;

  const vertexDeg =
    (calc?.houses?.angles && isFiniteNumber(calc.houses.angles.vertex)) ? calc.houses.angles.vertex :
      (calc?.engineHouses && isFiniteNumber(calc.engineHouses.vertex_deg)) ? calc.engineHouses.vertex_deg :
        null;

  const ascDegN = isFiniteNumber(ascDeg) ? norm360(ascDeg) : null;
  const mcDegN = isFiniteNumber(mcDeg) ? norm360(mcDeg) : null;
  const vertexDegN = isFiniteNumber(vertexDeg) ? norm360(vertexDeg) : null;

  // lat/lonあるのにasc/mc取れないのは異常 → job失敗にする
  if ((isFiniteNumber(lat) && isFiniteNumber(lon)) && (!isFiniteNumber(ascDegN) || !isFiniteNumber(mcDegN))) {
    throw new Error(`houses calc failed (asc/mc missing). lat=${lat} lon=${lon}`);
  }

  // --------------------
  // FINAL angles decision
  // --------------------
  // 同一birth & 既存が健全なら既存を優先（揺れ防止）
  // そうでなければ今回の計算値を採用（修復）
  const shouldUseExistingAngles =
    sameBirth &&
    existingMinAnglesOk &&
    existingHousesOk &&
    existingEngineHousesOk;

  const hasOptionalInCalc =
    calc?.bodies && (
      calc.bodies.chiron != null ||
      calc.bodies.lilith != null ||
      calc.bodies.north_node != null
    );
  const hasOptionalInExisting = (() => {
    const b = existing?.min?.bodies || {};
    return (
      b.chiron != null ||
      b.lilith != null ||
      b.north_node != null ||
      b.Chiron != null ||
      b.Lilith != null ||
      b.North_Node != null ||
      b.northNode != null ||
      b.mean_node != null ||
      b.true_node != null ||
      b.node != null
    );
  })();

  const calcHasNorthNode = calc?.bodies?.north_node != null;
  const existingHasNorthNode = (() => {
    const b = existing?.min?.bodies || {};
    return (
      b.north_node != null ||
      b.North_Node != null ||
      b.northNode != null ||
      b.mean_node != null ||
      b.true_node != null ||
      b.node != null
    );
  })();
  const forceRecalcBodies = calcHasNorthNode && !existingHasNorthNode;

  const useExistingBodies =
    existingMinBodiesOk &&
    !forceRecalcBodies &&
    (!hasOptionalInCalc || hasOptionalInExisting);

  const finalasc = shouldUseExistingAngles
    ? (existing?.min?.angles?.asc_deg ?? existing?.engine?.houses?.asc_deg ?? existing?.houses?.angles?.asc ?? null)
    : ascDegN;

  const finalmc = shouldUseExistingAngles
    ? (existing?.min?.angles?.mc_deg ?? existing?.engine?.houses?.mc_deg ?? existing?.houses?.angles?.mc ?? null)
    : mcDegN;

  const finalvertex = shouldUseExistingAngles
    ? (existing?.min?.angles?.vertex_deg ?? existing?.engine?.houses?.vertex_deg ?? existing?.houses?.angles?.vertex ?? null)
    : vertexDegN;

  const finalascP = isFiniteNumber(finalasc) ? toFixedPrecision(norm360(finalasc), PRECISION_DEG) : null;
  const finalmcP = isFiniteNumber(finalmc) ? toFixedPrecision(norm360(finalmc), PRECISION_DEG) : null;
  const finalvertexP = isFiniteNumber(finalvertex) ? toFixedPrecision(norm360(finalvertex), PRECISION_DEG) : null;
  const finaldcP = isFiniteNumber(finalascP) ? toFixedPrecision(norm360(finalascP + 180), PRECISION_DEG) : null;
  const finalicP = isFiniteNumber(finalmcP) ? toFixedPrecision(norm360(finalmcP + 180), PRECISION_DEG) : null;

  // --------------------
  // choose base houses objects then inject final angles
  // --------------------
  const nextHouses = deepClone(existingHousesOk ? existing.houses : (calc.houses || null));
  const nextEngineHouses = deepClone(existingEngineHousesOk ? existing.engine.houses : (calc.engineHouses || null));

  if (nextHouses && typeof nextHouses === "object") {
    if (!nextHouses.angles || typeof nextHouses.angles !== "object") nextHouses.angles = {};
    nextHouses.angles.asc = finalascP;
    nextHouses.angles.mc = finalmcP;
    nextHouses.angles.vertex = finalvertexP;
    nextHouses.angles.dc = finaldcP;
    nextHouses.angles.ic = finalicP;
  }

  if (nextEngineHouses && typeof nextEngineHouses === "object") {
    nextEngineHouses.asc_deg = finalascP;
    nextEngineHouses.mc_deg = finalmcP;
    nextEngineHouses.vertex_deg = finalvertexP;
  }

  const patch = {
    schema_version: "1.0.0",
    app_user_id: appUserId,

    birth: {
      ...(existing.birth || {}),
      ...(birth || {}),
      date_local: dateLocal ?? existing?.birth?.date_local ?? null,
      time_hm: timeHm ?? existing?.birth?.time_hm ?? null,
      timezone: timezone ?? existing?.birth?.timezone ?? null,
      lat: lat ?? existing?.birth?.lat ?? null,
      lon: lon ?? existing?.birth?.lon ?? null,
      place_text: place_text ?? existing?.birth?.place_text ?? null,
      place_formatted: place_formatted ?? existing?.birth?.place_formatted ?? null,
      place_id: place_id ?? existing?.birth?.place_id ?? null,
    },

    birth_hash: birthHash,

    engine: {
      ...(existing.engine || {}),
      name: "swisseph",
      version: "v1",
      ephemeris_source: "swisseph",
      precision_deg: PRECISION_DEG,
      houses_calc_version: HOUSES_CALC_VERSION,
      houses: nextEngineHouses || null,
    },

    houses: nextHouses || null,

    min: {
      ...(existing.min || {}),
      bodies: useExistingBodies ? existing.min.bodies : calc.bodies,
      angles: {
        asc_deg: finalascP,
        mc_deg: finalmcP,
        vertex_deg: finalvertexP,
        dc_deg: finaldcP,
        ic_deg: finalicP,
      },
    },

    // ✅ ここは「構造（positions）」だけを持つ
    natal_positions: {
      ...(existing.natal_positions || {}),
      positions: existing?.natal_positions?.positions ?? null,
    },

    // ✅ “計算が必要か” は doc直下の needs_compute だけを真にする
    needs_compute: false,

    computed_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  await cacheRef.set(patch, { merge: true });

  // --------------------
  // OPTIONAL: enqueue blueprint after natal cache ready (idempotent / non-blocking)
  // --------------------
  try {
    const ENABLE_BLUEPRINT = String(env2.WORKER_ENQUEUE_BLUEPRINT || "1") === "1";
    if (ENABLE_BLUEPRINT) {
      if (lineUserId) {
        const lastEnqueuedHash =
          existing?.notify?.blueprint_last_enqueued_birth_hash ||
          null;
        const shouldEnqueue = String(lastEnqueuedHash || "") !== String(birthHash);
        if (shouldEnqueue) {
          await setLineUserBlueprintPhase({
            db,
            admin,
            lineUserId,
            phase: BLUEPRINT_PHASE.QUEUED_BLUEPRINT,
            eventType: "blueprint_queued",
          });
          console.log("[worker] blueprint enqueue", {
            app_user_id: appUserId || null,
            line_user_id: lineUserId || null,
            birth_hash: birthHash || null,
          });
          await enqueueBlueprintGenerate({ env: env2, lineUserId, blueprintType: "light" });
          console.log("[worker] blueprint enqueued", {
            app_user_id: appUserId || null,
            line_user_id: lineUserId || null,
          });
          await cacheRef.set(
            {
              "notify.blueprint_last_enqueued_birth_hash": birthHash,
              "notify.blueprint_last_enqueued_line_user_id": lineUserId,
              "notify.blueprint_last_enqueued_at": admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          console.log("[worker] blueprint enqueue skipped (same birth_hash)", {
            app_user_id: appUserId || null,
            line_user_id: lineUserId || null,
            birth_hash: birthHash || null,
          });
        }
      }
    }
  } catch (e) {
    console.log("[worker] blueprint enqueue skipped/failed:", e?.message || String(e));
    if (lineUserId) {
      await setLineUserBlueprintPhase({
        db,
        admin,
        lineUserId,
        phase: BLUEPRINT_PHASE.BLUEPRINT_FAILED,
        eventType: "blueprint_enqueue_failed",
      });
    }
  }

  // --------------------
  // OPTIONAL: push natal result to LINE (idempotent / non-blocking)
  // --------------------
  try {
    const ENABLE_PUSH = String(env2.WORKER_PUSH_NATAL_RESULT || "0") === "1";
    const accessToken = env2.LINE_CHANNEL_ACCESS_TOKEN || null;

    // テスト用（本番解放したいなら 0 にする or この条件自体を消す）
    const OWNER_APP = String(env2.OWNER_APP_USER_ID || "").trim();
    const OWNER_ONLY = OWNER_APP ? (String(appUserId) === OWNER_APP) : false;

    if (!ENABLE_PUSH || !accessToken) return;

    // ✅ オーナー限定中なら、オーナー以外は送らない
    if (OWNER_APP && !OWNER_ONLY) return;

    if (!lineUserId) return;

    const latest = (await cacheRef.get()).data() || patch;

    const lastSentHash =
      latest?.notify?.last_sent_birth_hash ||
      existing?.notify?.last_sent_birth_hash ||
      null;

    const shouldSend = String(lastSentHash || "") !== String(birthHash);
    if (!shouldSend) return;

    const text = renderNatalListFromcache(latest);
    await linePush(accessToken, lineUserId, text);

    await cacheRef.set(
      {
        "notify.last_sent_birth_hash": birthHash,
        "notify.last_sent_line_user_id": lineUserId,
        "notify.last_sent_at": admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.log("[worker] push skipped/failed:", e?.message || String(e));
  }
  
  return {
    ok: true,
    processed: 1,
    job_id: jobId,
    app_user_id: appUserId,
    worker_id: WORKER_ID,
    cache_existed: cacheSnap.exists,
    same_birth: sameBirth,
    reused_min_bodies: existingMinBodiesOk,
    reused_engine_houses: existingEngineHousesOk,
    reused_houses: existingHousesOk,
    reused_angles: shouldUseExistingAngles,
    birth_hash: birthHash,
    has_latlon: isFiniteNumber(lat) && isFiniteNumber(lon),
    houses_calc_version: HOUSES_CALC_VERSION,
    final_angles: { asc_deg: finalascP, mc_deg: finalmcP, vertex_deg: finalvertexP },
  };
}

module.exports = {
  processOneNatalJob,
};
