"use strict";

/**
 * jobs/worker.js — Unified STABLE (v2025.12+)
 *
 * ✅ 目的
 * - jobs_natal_calc から queued を 1件だけ安全に取得して処理（transaction + lease）
 * - stale running を復旧（running → queued）
 * - attempts 上限
 * - natal_cache を idempotent に「作る or 足りない部分だけ埋める」
 *
 * ✅ natal_cache 保存方針（現状ベスト）
 * - min.bodies : 天体経度の最短参照（story側がここを最優先で読む）
 * - engine.houses : asc_deg / mc_deg / system（あなたの現状の保存先と一致）
 * - birth : 出生入力（place_text/date_local/time_hm/timezone/lat/lon/place_id/…）
 * - birth_hash : 出生が同一か判定できる安定キー
 *
 * ※ db は sora-no-koe-db を前提（admin側の初期化で databaseId を合わせる）
 */

const crypto = require("crypto");

// --------------------
// small utils
// --------------------
function minutes(n) {
    return n * 60 * 1000;
}
function nowMs() {
    return Date.now();
}
function nowDate() {
    return new Date();
}
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
 * 超軽量TZ対応（まずは Asia/Tokyo を確実に通す）
 * - job.birth_utc_iso があればそれを優先
 * - 無ければ、timezone が Asia/Tokyo の場合のみ date_local + time_hm を +09:00 でUTC化
 * - それ以外はエラー（将来 Luxon 等を入れるならここ差し替え）
 */
function birthUtcIsoFromJob(job) {
    if (job?.birth_utc_iso) return String(job.birth_utc_iso);

    const b = job?.birth || {};
    const dateLocal = b?.date_local || job?.date_local || null;
    const timeHm = b?.time_hm || job?.time_hm || null;
    const tz = b?.timezone || job?.timezone || null;

    if (!dateLocal || !timeHm) return null;

    if (tz === "Asia/Tokyo" || !tz) {
        // 例: 1990-07-24T12:18:00+09:00 → UTCへ
        const iso = `${dateLocal}T${timeHm}:00+09:00`;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    }

    return null;
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

        const lon = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
        if (!Number.isFinite(lon)) throw new Error(`invalid lon for ${name}`);

        bodies[name] = toFixedPrecision(norm360(lon), precisionDeg);
    }

    // houses（ASC/MC/Vertex）
    let houses = null;
    let engineHouses = null;

    if (isFiniteNumber(lat) && isFiniteNumber(lon)) {
        const hs = swisseph.swe_houses(jdUt, lat, lon, houseSystem);

        // cusps の形はライブラリ差があるので、破壊しない形で保存
        const cusps = hs?.house || hs?.cusps || null;
        const ascmc = hs?.ascmc || null;

        const asc = Array.isArray(ascmc) && typeof ascmc[0] === "number" ? norm360(ascmc[0]) : null;
        const mc = Array.isArray(ascmc) && typeof ascmc[1] === "number" ? norm360(ascmc[1]) : null;
        const vertex = Array.isArray(ascmc) && typeof ascmc[3] === "number" ? norm360(ascmc[3]) : null;

        // 互換保存（将来 cusp を使うなら houses.cusps をONにするだけ）
        houses = {
            system: houseSystem,
            cusps: Array.isArray(cusps) ? cusps.map((v) => (typeof v === "number" ? toFixedPrecision(norm360(v), precisionDeg) : v)) : null,
            angles: {
                ASC: isFiniteNumber(asc) ? toFixedPrecision(asc, precisionDeg) : null,
                MC: isFiniteNumber(mc) ? toFixedPrecision(mc, precisionDeg) : null,
                Vertex: isFiniteNumber(vertex) ? toFixedPrecision(vertex, precisionDeg) : null,
            },
        };

        // ✅ あなたの現状の保存先（engine.houses.*）
        engineHouses = {
            system: houseSystem,
            asc_deg: isFiniteNumber(asc) ? toFixedPrecision(asc, precisionDeg) : null,
            mc_deg: isFiniteNumber(mc) ? toFixedPrecision(mc, precisionDeg) : null,
            vertex_deg: isFiniteNumber(vertex) ? toFixedPrecision(vertex, precisionDeg) : null,
        };
    }

    return { jd_ut: jdUt, bodies, houses, engineHouses };
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

    const env = deps.env || {};

    // ops params
    const MAX_ATTEMPTS = Number(env.JOBS_MAX_ATTEMPTS || 5);
    const LEASE_MINUTES = Number(env.JOBS_LEASE_MINUTES || 10);
    const RESET_STALE = String(env.JOBS_RESET_STALE || "1") === "1";
    const STALE_LIMIT = Number(env.JOBS_STALE_LIMIT || 10);

    // calc params
    const HOUSE_SYSTEM = String(env.NATAL_HOUSE_SYSTEM || "P");
    const PRECISION_DEG = Number(env.NATAL_PRECISION_DEG || 0.01);

    const WORKER_ID = String(env.K_REVISION || "")
        ? `cr-${env.K_REVISION}-${randomId(6)}`
        : `local-${randomId(6)}`;

    const jobsCol = db.collection("jobs_natal_calc");

    // 1) stale reset（running → queued）
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
                jobsCol
                    .where("status", "==", "queued")
                    .orderBy("created_at", "asc")
                    .limit(1)
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

    if (!lockedRef) {
        return ok(res, { ran: true, processed: 0, worker_id: WORKER_ID });
    }

    // 3) process
    const job = lockedJob || {};
    const jobId = lockedId;

    try {
        const appUserId = job.app_user_id;
        if (!appUserId) throw new Error("job.app_user_id missing");

        // birth payload（揺れ吸収）
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

        // birth_hash（同一出生の安定キー）
        const birthHash = sha256Hex(
            JSON.stringify({
                date_local: dateLocal,
                time_hm: timeHm,
                timezone: timezone,
                lat: lat,
                lon: lon,
                place_id: place_id,
                place_text: place_text,
            })
        );

        // natal calc
        const calc = computeNatalCache({
            swisseph,
            birthUtcIso,
            houseSystem: HOUSE_SYSTEM,
            lat,
            lon,
            precisionDeg: PRECISION_DEG,
        });

        // cache merge（足りないところだけ埋める）
        const cacheRef = db.collection("natal_cache").doc(appUserId);
        const cacheSnap = await cacheRef.get();
        const existing = cacheSnap.exists ? (cacheSnap.data() || {}) : {};

        // 既存があっても、birth_hash が同一のときだけ既存を採用（違えば再計算で上書き）
        const existingBirthHash = existing?.birth_hash || null;
        const sameBirth = !!(existingBirthHash && existingBirthHash === birthHash);

        const hasMinBodies =
            sameBirth &&
            existing?.min?.bodies &&
            typeof existing.min.bodies === "object";

        const hasEngineHouses =
            sameBirth &&
            existing?.engine?.houses &&
            typeof existing.engine.houses === "object" &&
            isFiniteNumber(existing.engine.houses.asc_deg) &&
            isFiniteNumber(existing.engine.houses.mc_deg);


        const patch = {
            schema_version: existing.schema_version || "1.0.0",
            app_user_id: appUserId,

            // 出生情報は強い（更新されうるので merge）
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
                // ✅ 現状の保存先
                houses: hasEngineHouses ? existing.engine.houses : (calc.engineHouses || null),
            },

            // 互換用（将来 cusp を使うならここも参照できる）
            houses: existing.houses ?? calc.houses ?? null,

            // 最短参照（story はここを最優先で読む想定）
            min: {
                ...(existing.min || {}),
                bodies: hasMinBodies ? existing.min.bodies : calc.bodies,
            },

            // デバッグ/確認しやすい位置にも置いておく（必要ならrenderが拾える）
            natal_positions: {
                ...(existing.natal_positions || {}),
                needs_compute: false,
                // positions は重いので原則 null（必要になったら入れる）
                positions: existing?.natal_positions?.positions ?? null,
            },

            needs_compute: false,
            computed_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        await cacheRef.set(patch, { merge: true });

        // done
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
            filled_min_bodies: !hasMinBodies,
            filled_engine_houses: !hasEngineHouses,
            birth_hash: birthHash,
        });
    } catch (e) {
        await lockedRef.set(
            {
                status: "failed",
                last_error: e?.message ? String(e.message) : String(e),
                worker_id: WORKER_ID,
                finished_at: admin.firestore.FieldValue.serverTimestamp(),
                lease_expires_at: null,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return bad(res, 500, "job failed", {
            job_id: jobId,
            error: e?.message || String(e),
            worker_id: WORKER_ID,
        });
    }
}

module.exports = {
    handleJobsWorker,
    computeNatalCache, // ← テストで単体呼びしたい時に便利
};
