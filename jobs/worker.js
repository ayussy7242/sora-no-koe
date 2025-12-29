"use strict";

/**
 * jobs/worker.js
 * - jobs_natal_calc から queued を 1件だけ安全に取得して処理
 * - 取り合い防止（transaction + lease）
 * - stale running の復旧
 * - attempts 上限
 */

function minutes(n) {
  return n * 60 * 1000;
}

function nowMs() {
  return Date.now();
}

function randomId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function handleJobsWorker(req, res, deps = {}) {
  const { db, admin, ok, bad } = deps;

  if (!db) throw new Error("deps.db required");
  if (!admin) throw new Error("deps.admin required");
  if (!ok || !bad) throw new Error("deps.ok/bad required");

  const env = deps.env || {};

  // 運用パラメータ
  const MAX_ATTEMPTS = Number(env.JOBS_MAX_ATTEMPTS || 5);
  const LEASE_MINUTES = Number(env.JOBS_LEASE_MINUTES || 10); // running の “期限”
  const RESET_STALE = String(env.JOBS_RESET_STALE || "1") === "1"; // stale を queued に戻す
  const WORKER_ID = String(env.K_REVISION || "") ? `cr-${env.K_REVISION}-${randomId(6)}` : `local-${randomId(6)}`;

  // 1) stale job の復旧（任意）
  // ※本気で大量にあるときは別エンドポイントに切る or limit 付ける
  if (RESET_STALE) {
    try {
      const staleBefore = new Date(nowMs() - minutes(LEASE_MINUTES)).toISOString();
      // updated_at は Timestamp の可能性があるので、ここでは "lease_expires_at" を持つ設計に寄せるのが安全
      // ただし現状のデータ構造が不明なので、今回は lease_expires_at を採用する（下のロックで必ず入る）
      const staleQ = await db
        .collection("jobs_natal_calc")
        .where("status", "==", "running")
        .where("lease_expires_at", "<", new Date()) // Timestamp比較
        .limit(10)
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
      // stale復旧は “失敗してもworker自体は進める”
      console.log("[worker] stale reset skipped:", e?.message || String(e));
    }
  }

  // 2) queued を安全に 1件ロックして取る
  let lockedDoc = null;
  let lockedJob = null;

  try {
    await db.runTransaction(async (tx) => {
      // クエリは transaction 内でOK（ただし結果が古くなる可能性はあるので、ロックは doc で判定）
      const q = await tx.get(
        db
          .collection("jobs_natal_calc")
          .where("status", "==", "queued")
          .orderBy("created_at", "asc")
          .limit(1)
      );

      if (q.empty) return;

      const doc = q.docs[0];
      const ref = doc.ref;

      const job = doc.data() || {};
      const attempts = Number(job.attempts || 0);

      // attempts 上限
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

      // “まだ queued か？”を最終確認（同時実行の防波堤）
      if (job.status !== "queued") return;

      // ロック（lease）
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

      lockedDoc = doc;
      lockedJob = job;
    });
  } catch (e) {
    return bad(res, 500, "failed to lock job", { error: e?.message || String(e) });
  }

  if (!lockedDoc) {
    return ok(res, { ran: true, processed: 0, worker_id: WORKER_ID });
  }

  const ref = lockedDoc.ref;
  const job = lockedJob || {};
  const jobId = lockedDoc.id;

  // 3) 実処理
  try {
    const appUserId = job.app_user_id;
    if (!appUserId) {
      throw new Error("job.app_user_id missing");
    }

    // natal_cache を作る（既にあればスキップ）※idempotent
    const cacheRef = db.collection("natal_cache").doc(appUserId);
    const cacheSnap = await cacheRef.get();

    if (!cacheSnap.exists) {
      // TODO: ここに swisseph で natal positions 計算して入れる
      // いまは “空” でもOKだが、最低限のメタは入れとく
      await cacheRef.set(
        {
          computed_at: admin.firestore.FieldValue.serverTimestamp(),
          engine: { ephemeris_source: "swisseph" },
          natal_positions: {}, // TODO
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // job 完了
    await ref.set(
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
      cache_created: !cacheSnap.exists,
    });
  } catch (e) {
    // failed
    await ref.set(
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

    // worker自体は 500 にしてもいいけど、cron運用なら 200 の方が平和
    // 今回は「APIとして明確に失敗」を返すため 500
    return bad(res, 500, "job failed", { job_id: jobId, error: e?.message || String(e), worker_id: WORKER_ID });
  }
}

function norm360(deg) { let x = deg % 360; if (x < 0) x += 360; return x; }

function computeNatalCache({ swisseph, birthUtcIso, houseSystem = "P", lat, lon }) {
  const jdUt = (function jdUtFromIso(asOfISO) {
    const d = new Date(asOfISO);
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
    const lon = (typeof out.longitude === "number") ? out.longitude : out.data?.[0];
    bodies[name] = norm360(lon);
  }

  let houses = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const hs = swisseph.swe_houses(jdUt, lat, lon, houseSystem);
    // hs.house: 1..12 cusps（配列の形は実装により 1開始/0開始あり）
    const cusps = hs.house || hs.cusps || [];
    const ascmc = hs.ascmc || [];

    houses = {
      system: houseSystem,
      cusps: cusps.map((v) => (typeof v === "number" ? norm360(v) : v)),
      angles: {
        ASC: typeof ascmc[0] === "number" ? norm360(ascmc[0]) : null,
        MC: typeof ascmc[1] === "number" ? norm360(ascmc[1]) : null,
        Vertex: typeof ascmc[3] === "number" ? norm360(ascmc[3]) : null,
      },
    };
  }

  return { jd_ut: jdUt, bodies, houses };
}


module.exports = { handleJobsWorker };

