"use strict";

/**
 * jobs/worker.js — Unified STABLE (v2026.01+ FULL)
 *
 * ✅ 目的（このファイルが担う“唯一の真実”）
 * - jobs_natal_calc の queued を「1件だけ」安全に取得して処理（transaction + lease）
 * - stale running を復旧（running → queued）
 * - attempts 上限
 * - natal_cache を idempotent に「作る or 必要な時だけ再計算」
 *
 * ✅ 設計思想（ソラのこえに沿う）
 * - “計算”は裏方（worker）に閉じる
 * - キャッシュは birth_hash が一致したときだけ再利用（揺れ防止）
 * - ASC/MC/Vertex は最重要。壊れてたら必ず修復する
 *
 * ✅ Export
 * - handleJobsWorker(req,res,deps): cron/worker 用
 * - computeNatalCache(...): 単体計算（再利用用）
 * - processOneNatalJob(deps, opts): 内部呼び出し用（LINE側で1回だけ叩く用途にも使える）
 */

const crypto = require("crypto");
const { createRenderers } = require("../engine/render");
const dict = require("../dict");
const { renderNatalListFromCache } = createRenderers({ dict });

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

async function getFetch() {
  if (typeof fetch === "function") return fetch;
  // Node18未満などの保険（入ってなければエラーになるが、その場合は push だけスキップされる）
  const mod = await import("node-fetch");
  return mod.default;
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

// deep clone（Firestoreの既存オブジェクトを破壊しないため）
function deepClone(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    // stringifyできない型が混じっても落とさない（最終防衛）
    return v;
  }
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

  // 将来拡張するならここ
  return null;
}

/**
 * 
 * LINE PUSJ
 * 
 */

async function linePush(accessToken, to, text) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (!to) throw new Error("line user id missing");
  const msg = String(text || "").trim();
  if (!msg) throw new Error("push text empty");

  const f = await getFetch();
  const res = await f("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: msg.slice(0, 4800) }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }
  return true;
}


/**
 * swe_houses の返り値吸収
 * - cusps: hs.house / hs.cusps / hs.cusp
 * - ascmc: hs.ascmc / hs.ascMc / hs.asc_mc
 */
function normalizeHousesResult(hs) {
  if (!hs || typeof hs !== "object") return { cusps: null, ascmc: null };

  const cusps = hs.house || hs.cusps || hs.cusp || null;
  let ascmc = hs.ascmc || hs.ascMc || hs.asc_mc || null;

  // ascmc が無い場合は ascendant/mc/vertex から作る
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

function pickAscMcVertex(ascmc) {
  // TypedArray(Float64Array等) を配列に変換
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
function computeNatalCache({
  swisseph,
  birthUtcIso,
  houseSystem = "P",
  lat,
  lon,
  precisionDeg = 0.01,
  debug = false,
}) {
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
  let hsRaw = null;

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

    if (debug) {
      console.log("[debug:swe_houses]", {
        keys: hsRaw ? Object.keys(hsRaw) : null,
        ascmc_type: hsRaw?.ascmc ? Object.prototype.toString.call(hsRaw.ascmc) : null,
        ascmc_isArray: Array.isArray(hsRaw?.ascmc),
        ascmc_isView: hsRaw?.ascmc ? ArrayBuffer.isView(hsRaw.ascmc) : null,
        ascmc_len: hsRaw?.ascmc?.length ?? null,
        normalized_ascmc_type: ascmc ? Object.prototype.toString.call(ascmc) : null,
        normalized_ascmc_isArray: Array.isArray(ascmc),
        normalized_ascmc_isView: ascmc ? ArrayBuffer.isView(ascmc) : null,
        normalized_ascmc_len: ascmc?.length ?? null,
        asc, mc, vertex,
      });
    }
  }

  return { jd_ut: jdUt, bodies, houses, engineHouses };
}

// --------------------
// validators
// --------------------
function housesLooksValid(h) {
  if (!h || typeof h !== "object") return false;

  const asc = Number(h.asc_deg);
  const mc = Number(h.mc_deg);

  if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
  if (asc < 0 || asc >= 360) return false;
  if (mc < 0 || mc >= 360) return false;
  if (Math.abs(asc - mc) < 1e-9) return false;

  return true;
}

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
  // 太陽〜冥王星が揃ってる想定（10個以上）
  return Object.keys(bodies).length >= 10;
}

function minAnglesLooksValid(a) {
  if (!a || typeof a !== "object") return false;

  const asc = Number(a.asc_deg ?? a.ASC ?? a.asc);
  const mc = Number(a.mc_deg ?? a.MC ?? a.mc);

  if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
  if (asc < 0 || asc >= 360) return false;
  if (mc < 0 || mc >= 360) return false;
  if (Math.abs(asc - mc) < 1e-9) return false;

  return true;
}

// --------------------
// job flow (reusable core)
// --------------------
async function resetStaleRunningJobs({ db, admin, jobsCol, limit = 10 }) {
  const staleQ = await jobsCol
    .where("status", "==", "running")
    .where("lease_expires_at", "<", nowDate())
    .limit(limit)
    .get();

  if (staleQ.empty) return { reset: 0 };

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
  return { reset: staleQ.docs.length };
}

/**
 * queued を1件だけロックして返す
 * @returns { lockedRef, lockedId, lockedJob } or null
 */
async function lockOneQueuedJob({ db, admin, jobsCol, maxAttempts, leaseMinutes, workerId }) {
  let lockedRef = null;
  let lockedId = null;
  let lockedJob = null;

  await db.runTransaction(async (tx) => {
    const q = await tx.get(
      jobsCol.where("status", "==", "queued").orderBy("created_at", "asc").limit(1)
    );
    if (q.empty) return;

    const doc = q.docs[0];
    const ref = doc.ref;
    const job = doc.data() || {};
    const attempts = Number(job.attempts || 0);

    if (attempts >= maxAttempts) {
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

    const leaseExpiresAt = new Date(nowMs() + minutes(leaseMinutes));

    tx.set(
      ref,
      {
        status: "running",
        attempts: attempts + 1,
        worker_id: workerId,
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

  if (!lockedRef) return null;
  return { lockedRef, lockedId, lockedJob };
}

async function finalizeJobDone({ admin, lockedRef, workerId }) {
  await lockedRef.set(
    {
      status: "done",
      last_error: null,
      worker_id: workerId,
      finished_at: admin.firestore.FieldValue.serverTimestamp(),
      lease_expires_at: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function finalizeJobFailed({ admin, lockedRef, workerId, error }) {
  await lockedRef.set(
    {
      status: "failed",
      last_error: error?.message ? String(error.message) : String(error),
      worker_id: workerId,
      finished_at: admin.firestore.FieldValue.serverTimestamp(),
      lease_expires_at: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

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
    (calc?.houses?.angles && isFiniteNumber(calc.houses.angles.ASC)) ? calc.houses.angles.ASC :
      (calc?.engineHouses && isFiniteNumber(calc.engineHouses.asc_deg)) ? calc.engineHouses.asc_deg :
        null;

  const mcDeg =
    (calc?.houses?.angles && isFiniteNumber(calc.houses.angles.MC)) ? calc.houses.angles.MC :
      (calc?.engineHouses && isFiniteNumber(calc.engineHouses.mc_deg)) ? calc.engineHouses.mc_deg :
        null;

  const vertexDeg =
    (calc?.houses?.angles && isFiniteNumber(calc.houses.angles.Vertex)) ? calc.houses.angles.Vertex :
      (calc?.engineHouses && isFiniteNumber(calc.engineHouses.vertex_deg)) ? calc.engineHouses.vertex_deg :
        null;

  const ascDegN = isFiniteNumber(ascDeg) ? norm360(ascDeg) : null;
  const mcDegN = isFiniteNumber(mcDeg) ? norm360(mcDeg) : null;
  const vertexDegN = isFiniteNumber(vertexDeg) ? norm360(vertexDeg) : null;

  // lat/lonあるのにASC/MC取れないのは異常 → job失敗にする
  if ((isFiniteNumber(lat) && isFiniteNumber(lon)) && (!isFiniteNumber(ascDegN) || !isFiniteNumber(mcDegN))) {
    throw new Error(`houses calc failed (ASC/MC missing). lat=${lat} lon=${lon}`);
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

  const finalAsc = shouldUseExistingAngles
    ? (existing?.min?.angles?.asc_deg ?? existing?.engine?.houses?.asc_deg ?? existing?.houses?.angles?.ASC ?? null)
    : ascDegN;

  const finalMc = shouldUseExistingAngles
    ? (existing?.min?.angles?.mc_deg ?? existing?.engine?.houses?.mc_deg ?? existing?.houses?.angles?.MC ?? null)
    : mcDegN;

  const finalVertex = shouldUseExistingAngles
    ? (existing?.min?.angles?.vertex_deg ?? existing?.engine?.houses?.vertex_deg ?? existing?.houses?.angles?.Vertex ?? null)
    : vertexDegN;

  const finalAscP = isFiniteNumber(finalAsc) ? toFixedPrecision(norm360(finalAsc), PRECISION_DEG) : null;
  const finalMcP = isFiniteNumber(finalMc) ? toFixedPrecision(norm360(finalMc), PRECISION_DEG) : null;
  const finalVertexP = isFiniteNumber(finalVertex) ? toFixedPrecision(norm360(finalVertex), PRECISION_DEG) : null;

  // --------------------
  // choose base houses objects then inject final angles
  // --------------------
  const nextHouses = deepClone(existingHousesOk ? existing.houses : (calc.houses || null));
  const nextEngineHouses = deepClone(existingEngineHousesOk ? existing.engine.houses : (calc.engineHouses || null));

  if (nextHouses && typeof nextHouses === "object") {
    if (!nextHouses.angles || typeof nextHouses.angles !== "object") nextHouses.angles = {};
    nextHouses.angles.ASC = finalAscP;
    nextHouses.angles.MC = finalMcP;
    nextHouses.angles.Vertex = finalVertexP;
  }

  if (nextEngineHouses && typeof nextEngineHouses === "object") {
    nextEngineHouses.asc_deg = finalAscP;
    nextEngineHouses.mc_deg = finalMcP;
    nextEngineHouses.vertex_deg = finalVertexP;
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
      bodies: existingMinBodiesOk ? existing.min.bodies : calc.bodies,
      angles: {
        asc_deg: finalAscP,
        mc_deg: finalMcP,
        vertex_deg: finalVertexP,
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
  // OPTIONAL: push natal result to LINE (idempotent / non-blocking)
  // --------------------
  try {
    const ENABLE_PUSH = String(env2.WORKER_PUSH_NATAL_RESULT || "0") === "1";
    const accessToken = env2.LINE_CHANNEL_ACCESS_TOKEN || null;

    // const OWNER_ONLY =
    //   env2.OWNER_APP_USER_ID &&
    //   String(env2.OWNER_APP_USER_ID) === String(appUserId);

    // push自体をやらない条件なら「何もしない」で終わり（関数returnしない）
    if (!ENABLE_PUSH || !OWNER_ONLY || !accessToken) {
      // skip push
    } else {
      const userSnap = await db.collection("users").doc(appUserId).get();
      const user = userSnap.exists ? (userSnap.data() || {}) : {};
      const lineUserId = user?.channels?.line?.line_user_id || null;

      if (!lineUserId) {
        // skip push
      } else {
        // latest を読んで「最新の notify」を見る（冪等の最終防衛）
        const latest = (await cacheRef.get()).data() || patch;

        const lastSentHash =
          latest?.notify?.last_sent_birth_hash ||
          existing?.notify?.last_sent_birth_hash ||
          null;

        const shouldSend = String(lastSentHash || "") !== String(birthHash);
        if (shouldSend) {
          const text = renderNatalListFromCache(latest);

          await linePush(accessToken, lineUserId, text);

          // notify はドットパスで更新（将来のキー消し事故防止）
          await cacheRef.set(
            {
              "notify.last_sent_birth_hash": birthHash,
              "notify.last_sent_line_user_id": lineUserId,
              "notify.last_sent_at": admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }
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
    final_angles: { asc_deg: finalAscP, mc_deg: finalMcP, vertex_deg: finalVertexP },
  };
}

// --------------------
// main worker (HTTP handler)
// --------------------
async function handleJobsWorker(req, res, deps = {}) {
  const { db, admin, ok, bad, swisseph } = deps;

  if (!db) throw new Error("deps.db required");
  if (!admin) throw new Error("deps.admin required");
  if (!ok || !bad) throw new Error("deps.ok/bad required");
  if (!swisseph) throw new Error("deps.swisseph required");

  // env参照はここに統一
  const env2 = { ...(deps.env || {}), ...(process.env || {}) };

  const MAX_ATTEMPTS = Number(env2.JOBS_MAX_ATTEMPTS || 5);
  const LEASE_MINUTES = Number(env2.JOBS_LEASE_MINUTES || 10);
  const RESET_STALE = String(env2.JOBS_RESET_STALE || "1") === "1";
  const STALE_LIMIT = Number(env2.JOBS_STALE_LIMIT || 10);

  const WORKER_ID = String(env2.K_REVISION || "")
    ? `cr-${env2.K_REVISION}-${randomId(6)}`
    : `local-${randomId(6)}`;

  const jobsCol = db.collection("jobs_natal_calc");

  // 1) stale reset
  if (RESET_STALE) {
    try {
      await resetStaleRunningJobs({ db, admin, jobsCol, limit: STALE_LIMIT });
    } catch (e) {
      console.log("[worker] stale reset skipped:", e?.message || String(e));
    }
  }

  // 2) lock one queued job
  let locked = null;
  try {
    locked = await lockOneQueuedJob({
      db,
      admin,
      jobsCol,
      maxAttempts: MAX_ATTEMPTS,
      leaseMinutes: LEASE_MINUTES,
      workerId: WORKER_ID,
    });
  } catch (e) {
    return bad(res, 500, "failed to lock job", { error: e?.message || String(e), worker_id: WORKER_ID });
  }

  if (!locked) return ok(res, { ran: true, processed: 0, worker_id: WORKER_ID });

  const { lockedRef, lockedId, lockedJob } = locked;

  // 3) process
  try {
    const result = await processOneNatalJob(
      { db, admin, swisseph, env: env2 },
      { job: lockedJob, job_id: lockedId }
    );

    await finalizeJobDone({ admin, lockedRef, workerId: WORKER_ID });

    return ok(res, {
      ran: true,
      ...result,
      worker_id: WORKER_ID,
    });
  } catch (e) {
    try {
      await finalizeJobFailed({ admin, lockedRef, workerId: WORKER_ID, error: e });
    } catch (e2) {
      console.log("[worker] finalize failed:", e2?.message || String(e2));
    }

    return bad(res, 500, "job failed", {
      job_id: lockedId,
      error: e?.message || String(e),
      worker_id: WORKER_ID,
    });
  }
}

module.exports = {
  handleJobsWorker,
  computeNatalCache,
  processOneNatalJob, // ← LINE側からの即時1回キックに使えるように出しておく
};
