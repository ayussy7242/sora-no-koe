"use strict";

/**
 * jobs/worker.js — Unified STABLE (v2025.12+ FINAL) — OPTIMIZED
 *
 * Goals:
 * - env参照を env2 に統一（process.env + deps.env）
 * - natal_cache reuse判定を堅牢化（min.bodies / houses）
 * - swe_houses の返り値差分を吸収
 * - 読める / 事故らない / 速い
 */

const crypto = require("crypto");

// --------------------
// small utils
// --------------------
function minutes(n) { return n * 60 * 1000; }
function nowMs() { return Date.now(); }
function nowDate() { return new Date(); }

function randomId(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function norm360(deg) {
    let x = deg % 360;
    if (x < 0) x += 360;
    return x;
}

function toFixedPrecision(n, precisionDeg = 0.01) {
    const x = Number(n);
    const p = 1 / precisionDeg;
    return Math.round(x * p) / p;
}

function isFiniteNumber(x) {
    return typeof x === "number" && Number.isFinite(x);
}

function sha256Hex(str) {
    return crypto.createHash("sha256").update(String(str ?? ""), "utf8").digest("hex");
}

/**
 * 超軽量TZ対応（現要件：Asia/Tokyo を確実に通す）
 * - job.birth_utc_iso があればそれを優先
 * - 無ければ date_local + time_hm + tz から生成
 */
function birthUtcIsoFromJob(job) {
    if (job?.birth_utc_iso) return String(job.birth_utc_iso);

    const b = job?.birth || {};
    const dateLocal = b?.date_local || job?.date_local || null;
    const timeHm = b?.time_hm || job?.time_hm || null;
    const tz = b?.timezone || job?.timezone || null;

    if (!dateLocal || !timeHm) return null;

    if (tz === "Asia/Tokyo" || !tz) {
        const iso = `${dateLocal}T${timeHm}:00+09:00`;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    }

    return null;
}

/**
 * swe_houses の返り値吸収
 * - cusps: hs.house / hs.cusps / hs.cusp
 * - ascmc: hs.ascmc / hs.ascMc / hs.asc_mc
 */
function normalizeHousesResult(hs) {
  if (!hs || typeof hs !== "object") return { cusps: null, ascmc: null };

  // cusps（Placidusなら house に入ってることが多い）
  const cusps = hs.house || hs.cusps || hs.cusp || null;

  // ascmc（ライブラリによって無い）
  let ascmc = hs.ascmc || hs.ascMc || hs.asc_mc || null;

  // ✅ ascmc が無い場合は ascendant/mc/vertex から作る
  if (!ascmc) {
    const asc = typeof hs.ascendant === "number" ? hs.ascendant : null;
    const mc = typeof hs.mc === "number" ? hs.mc : null;
    const vertex = typeof hs.vertex === "number" ? hs.vertex : null;

    // swe_houses の ascmc 配列っぽい並びに寄せる
    // [ASC, MC, ARMC, Vertex, ...] みたいな前提
    if (asc != null || mc != null || vertex != null) {
      ascmc = [asc, mc, hs.armc ?? null, vertex];
    }
  }

  return { cusps, ascmc };
}


function pickAscMcVertex(ascmc) {
    // ✅ TypedArray(Float64Array等) を配列に変換
    if (ascmc && typeof ascmc === "object" && ArrayBuffer.isView(ascmc)) {
        ascmc = Array.from(ascmc);
    }

    // 1) 配列形式
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

    // 2) オブジェクト形式
    if (ascmc && typeof ascmc === "object") {
        const asc = Number(ascmc.asc ?? ascmc.ASC ?? ascmc.asc_deg ?? ascmc[0]);
        const mc = Number(ascmc.mc ?? ascmc.MC ?? ascmc.mc_deg ?? ascmc[1]);
        const vertex = Number(ascmc.vertex ?? ascmc.Vertex ?? ascmc.vertex_deg ?? ascmc[3]);
        return {
            asc: Number.isFinite(asc) ? asc : null,
            mc: Number.isFinite(mc) ? mc : null,
            vertex: Number.isFinite(vertex) ? vertex : null,
        };
    }

    return { asc: null, mc: null, vertex: null };
}



// --------------------
// Swiss Ephemeris natal calc
// --------------------
function computeNatalCache({ swisseph, birthUtcIso, houseSystem = "P", lat, lon, precisionDeg = 0.01 }) {
  if (!swisseph) throw new Error("computeNatalCache requires swisseph");
  if (!birthUtcIso) throw new Error("computeNatalCache requires birthUtcIso");

  const jdUt = (function jdUtFromIso(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid ISO: ${iso}`);

    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hour =
      d.getUTCHours() +
      d.getUTCMinutes() / 60 +
      d.getUTCSeconds() / 3600 +
      d.getUTCMilliseconds() / 3600000;

    return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
  })(birthUtcIso);

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;

  const MAP = {
    Sun: swisseph.SE_SUN,
    Moon: swisseph.SE_MOON,
    Mercury: swisseph.SE_MERCURY,
    Venus: swisseph.SE_VENUS,
    Mars: swisseph.SE_MARS,
    Jupiter: swisseph.SE_JUPITER,
    Saturn: swisseph.SE_SATURN,
    Uranus: swisseph.SE_URANUS,
    Neptune: swisseph.SE_NEPTUNE,
    Pluto: swisseph.SE_PLUTO,
  };

  const bodies = {};
  for (const [name, id] of Object.entries(MAP)) {
    const out = swisseph.swe_calc_ut(jdUt, id, flags);
    if (!out || out.error) throw new Error(`swe_calc_ut failed for ${name}: ${out?.error || "unknown"}`);

    const lon1 = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
    if (!Number.isFinite(lon1)) throw new Error(`invalid lon for ${name}`);

    bodies[name] = toFixedPrecision(norm360(lon1), precisionDeg);
  }

  let houses = null;
  let engineHouses = null;

  // ✅ ここで宣言しておく（ログで参照できるように）
  let hsRaw = null;

  // houses / angles は lat/lon があるときだけ
  if (isFiniteNumber(lat) && isFiniteNumber(lon)) {
    hsRaw = swisseph.swe_houses(jdUt, lat, lon, houseSystem);
    const { cusps, ascmc } = normalizeHousesResult(hsRaw);

    const { asc, mc, vertex } = pickAscMcVertex(ascmc);

    houses = {
      system: houseSystem,
      cusps: Array.isArray(cusps)
        ? cusps.map((v) => (typeof v === "number" ? toFixedPrecision(norm360(v), precisionDeg) : v))
        : null,
      angles: {
        ASC: Number.isFinite(asc) ? toFixedPrecision(norm360(asc), precisionDeg) : null,
        MC: Number.isFinite(mc) ? toFixedPrecision(norm360(mc), precisionDeg) : null,
        Vertex: Number.isFinite(vertex) ? toFixedPrecision(norm360(vertex), precisionDeg) : null,
      },
    };

    engineHouses = {
      system: houseSystem,
      asc_deg: Number.isFinite(asc) ? toFixedPrecision(norm360(asc), precisionDeg) : null,
      mc_deg: Number.isFinite(mc) ? toFixedPrecision(norm360(mc), precisionDeg) : null,
      vertex_deg: Number.isFinite(vertex) ? toFixedPrecision(norm360(vertex), precisionDeg) : null,
    };

    // ✅ ログはここ（hsRawが確実に存在する場所）
    console.log("[debug:swe_houses]", {
      keys: hsRaw ? Object.keys(hsRaw) : null,
      ascmc_type: hsRaw?.ascmc ? Object.prototype.toString.call(hsRaw.ascmc) : null,
      ascmc_isArray: Array.isArray(hsRaw?.ascmc),
      ascmc_isView: hsRaw?.ascmc ? ArrayBuffer.isView(hsRaw.ascmc) : null,
      ascmc_len: hsRaw?.ascmc?.length ?? null,

      // normalize後も見たいなら追加（超おすすめ）
      normalized_ascmc_type: ascmc ? Object.prototype.toString.call(ascmc) : null,
      normalized_ascmc_isArray: Array.isArray(ascmc),
      normalized_ascmc_isView: ascmc ? ArrayBuffer.isView(ascmc) : null,
      normalized_ascmc_len: ascmc?.length ?? null,

      asc, mc, vertex,
    });
  }

  return { jd_ut: jdUt, bodies, houses, engineHouses };
}



// engine.houses（asc_deg / mc_deg）の妥当性
function housesLooksValid(h) {
    if (!h || typeof h !== "object") return false;

    const asc = Number(h.asc_deg);
    const mc = Number(h.mc_deg);

    if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
    if (asc < 0 || asc >= 360) return false;
    if (mc < 0 || mc >= 360) return false;

    // ASCとMCが完全一致は異常として弾く
    if (Math.abs(asc - mc) < 1e-9) return false;

    return true;
}

// houses（詳細：angles / cusps）の妥当性
function housesStructLooksValid(h) {
    if (!h || typeof h !== "object") return false;
    const a = h.angles;
    if (!a || typeof a !== "object") return false;

    const asc = Number(a.ASC);
    const mc = Number(a.MC);

    if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
    if (asc < 0 || asc >= 360) return false;
    if (mc < 0 || mc >= 360) return false;

    if (Math.abs(asc - mc) < 1e-9) return false;

    if (h.cusps != null) {
        if (!Array.isArray(h.cusps)) return false;
        if (h.cusps.length < 12) return false;
    }

    return true;
}

function minBodiesLooksValid(bodies) {
    if (!bodies || typeof bodies !== "object") return false;
    const keys = Object.keys(bodies);
    // 10天体が揃ってるか（最低ライン）
    return keys.length >= 10;
}

// --------------------
// main worker
// --------------------
async function handleJobsWorker(req, res, deps = {}) {
    const { db, admin, ok, bad, swisseph } = deps;

    if (!db) throw new Error("deps.db required");
    if (!admin) throw new Error("deps.admin required");
    if (!ok || !bad) throw new Error("deps.ok/bad required");
    if (!swisseph) throw new Error("deps.swisseph required");

    // ✅ env参照はここに統一
    const env2 = { ...(process.env || {}), ...(deps.env || {}) };

    const MAX_ATTEMPTS = Number(env2.JOBS_MAX_ATTEMPTS || 5);
    const LEASE_MINUTES = Number(env2.JOBS_LEASE_MINUTES || 10);
    const RESET_STALE = String(env2.JOBS_RESET_STALE || "1") === "1";
    const STALE_LIMIT = Number(env2.JOBS_STALE_LIMIT || 10);

    const HOUSE_SYSTEM = String(env2.NATAL_HOUSE_SYSTEM || "P");
    const PRECISION_DEG = Number(env2.NATAL_PRECISION_DEG || 0.01);
    const HOUSES_CALC_VERSION = String(env2.NATAL_HOUSES_CALC_VERSION || "2025-12-31-a");

    const WORKER_ID = String(env2.K_REVISION || "")
        ? `cr-${env2.K_REVISION}-${randomId(6)}`
        : `local-${randomId(6)}`;

    const jobsCol = db.collection("jobs_natal_calc");

    // 1) stale reset
    if (RESET_STALE) {
        try {
            const staleQ = await jobsCol
                .where("status", "==", "running")
                .where("lease_expires_at", "<", nowDate())
                .limit(STALE_LIMIT)
                .get();

            if (!staleQ.empty) {
                const batch = db.batch();
                staleQ.docs.forEach((d) => {
                    batch.set(
                        d.ref,
                        {
                            status: "queued",
                            last_error: "stale lease reset",
                            worker_id: null,
                            lease_expires_at: null,
                            updated_at: admin.firestore.FieldValue.serverTimestamp(),
                        },
                        { merge: true }
                    );
                });
                await batch.commit();
            }
        } catch (e) {
            console.log("[worker] stale reset skipped:", e?.message || String(e));
        }
    }

    // 2) lock one queued job
    let lockedRef = null;
    let lockedId = null;
    let lockedJob = null;

    try {
        await db.runTransaction(async (tx) => {
            const q = await tx.get(
                jobsCol.where("status", "==", "queued").orderBy("created_at", "asc").limit(1)
            );
            if (q.empty) return;

            const doc = q.docs[0];
            const ref = doc.ref;
            const job = doc.data() || {};
            const attempts = Number(job.attempts || 0);

            if (attempts >= MAX_ATTEMPTS) {
                tx.set(
                    ref,
                    {
                        status: "failed",
                        last_error: `max attempts reached (${attempts})`,
                        updated_at: admin.firestore.FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
                return;
            }

            if (job.status !== "queued") return;

            const leaseExpiresAt = new Date(nowMs() + minutes(LEASE_MINUTES));

            tx.set(
                ref,
                {
                    status: "running",
                    attempts: attempts + 1,
                    worker_id: WORKER_ID,
                    lease_expires_at: leaseExpiresAt,
                    started_at: admin.firestore.FieldValue.serverTimestamp(),
                    updated_at: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            lockedRef = ref;
            lockedId = doc.id;
            lockedJob = job;
        });
    } catch (e) {
        return bad(res, 500, "failed to lock job", { error: e?.message || String(e), worker_id: WORKER_ID });
    }

    if (!lockedRef) return ok(res, { ran: true, processed: 0, worker_id: WORKER_ID });

    // 3) process
    const job = lockedJob || {};
    const jobId = lockedId;

    try {
        const appUserId = job.app_user_id;
        if (!appUserId) throw new Error("job.app_user_id missing");

        const birth = job.birth || {};
        const lat = isFiniteNumber(birth.lat) ? birth.lat : (isFiniteNumber(job.lat) ? job.lat : null);
        const lon = isFiniteNumber(birth.lon) ? birth.lon : (isFiniteNumber(job.lon) ? job.lon : null);

        const birthUtcIso = birthUtcIsoFromJob(job);
        if (!birthUtcIso) {
            throw new Error("birth_utc_iso missing (or timezone not supported). Provide job.birth_utc_iso or Asia/Tokyo date_local+time_hm.");
        }

        const dateLocal = birth.date_local || job.date_local || null;
        const timeHm = birth.time_hm || job.time_hm || null;
        const timezone = birth.timezone || job.timezone || null;

        const place_text = birth.place_text || job.place_text || null;
        const place_formatted = birth.place_formatted || job.place_formatted || null;
        const place_id = birth.place_id || job.place_id || null;

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

        // ✅ ここがユーザーの質問のド真ん中（最適版）
        const existingMinBodiesOk =
            sameBirth &&
            existing?.min?.bodies &&
            typeof existing.min.bodies === "object" &&
            minBodiesLooksValid(existing.min.bodies) &&
            existing?.engine?.ephemeris_source === "swisseph" &&
            Number(existing?.engine?.precision_deg) === Number(PRECISION_DEG);

        const patch = {
            schema_version: existing.schema_version || "1.0.0",
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
                houses: existingEngineHousesOk ? existing.engine.houses : (calc.engineHouses || null),
            },

            houses: existingHousesOk ? existing.houses : (calc.houses || null),

            min: {
                ...(existing.min || {}),
                bodies: existingMinBodiesOk ? existing.min.bodies : calc.bodies,
            },

            natal_positions: {
                ...(existing.natal_positions || {}),
                needs_compute: false,
                positions: existing?.natal_positions?.positions ?? null,
            },

            needs_compute: false,
            computed_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        await cacheRef.set(patch, { merge: true });

        await lockedRef.set(
            {
                status: "done",
                last_error: null,
                worker_id: WORKER_ID,
                finished_at: admin.firestore.FieldValue.serverTimestamp(),
                lease_expires_at: null,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return ok(res, {
            ran: true,
            processed: 1,
            job_id: jobId,
            app_user_id: appUserId,
            worker_id: WORKER_ID,
            cache_existed: cacheSnap.exists,
            same_birth: sameBirth,
            reused_min_bodies: existingMinBodiesOk,
            reused_engine_houses: existingEngineHousesOk,
            reused_houses: existingHousesOk,
            birth_hash: birthHash,
            has_latlon: isFiniteNumber(lat) && isFiniteNumber(lon),
            houses_calc_version: HOUSES_CALC_VERSION,
        });
    } catch (e) {
        await lockedRef.set(
            {
                status: "failed",
                last_error: e?.message ? String(e.message) : String(e),
                worker_id: String((process.env || {}).K_REVISION || "") ? String((process.env || {}).K_REVISION) : null,
                finished_at: admin.firestore.FieldValue.serverTimestamp(),
                lease_expires_at: null,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return bad(res, 500, "job failed", {
            job_id: jobId,
            error: e?.message || String(e),
            worker_id: "see job doc",
        });
    }
}

module.exports = { handleJobsWorker, computeNatalCache };
