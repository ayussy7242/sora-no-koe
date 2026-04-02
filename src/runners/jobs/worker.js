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
 * - asc/mc/vertex は最重要。壊れてたら必ず修復する
 *
 * ✅ Export
 * - handleJobsWorker(req,res,deps): cron/worker 用
 * - computeNatalCache(...): 単体計算（再利用用）
 * - processOneNatalJob(deps, opts): 内部呼び出し用（LINE側で1回だけ叩く用途にも使える）
 */

const { randomId } = require("./worker/utils");
const {
  resetStaleRunningJobs,
  lockOneQueuedJob,
  finalizeJobDone,
  finalizeJobFailed,
} = require("./worker/lease");
const { computeNatalCache } = require("./worker/natal/cache");
const { processOneNatalJob } = require("./worker/handlers/natal_calc");

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
