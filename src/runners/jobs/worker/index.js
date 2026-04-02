"use strict";

/**
 * jobs/worker — Unified STABLE (v2026.01+ FULL)
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

const { buildWorkerContext } = require("./context");
const { lockNextJob } = require("./router");
const { finalizeJobDone, finalizeJobFailed } = require("./lease");
const {
  buildNoJobResult,
  buildOkResult,
  buildLockErrorResult,
  buildJobFailedResult,
} = require("./result");
const { computeNatalCache } = require("./natal/cache");
const { processOneNatalJob } = require("./handlers/natal_calc");

// --------------------
// main worker (HTTP handler)
// --------------------
async function handleJobsWorker(req, res, deps = {}) {
  const ctx = buildWorkerContext(deps);
  const { db, admin, ok, bad, swisseph, env, workerId } = ctx;

  let locked = null;
  try {
    locked = await lockNextJob(ctx);
  } catch (e) {
    return bad(res, 500, "failed to lock job", buildLockErrorResult(workerId, e));
  }

  if (!locked) return ok(res, buildNoJobResult(workerId));

  const { lockedRef, lockedId, lockedJob } = locked;

  // 3) process
  try {
    const result = await processOneNatalJob(
      { db, admin, swisseph, env },
      { job: lockedJob, job_id: lockedId }
    );

    await finalizeJobDone({ admin, lockedRef, workerId });

    return ok(res, buildOkResult(workerId, result));
  } catch (e) {
    try {
      await finalizeJobFailed({ admin, lockedRef, workerId, error: e });
    } catch (e2) {
      console.log("[worker] finalize failed:", e2?.message || String(e2));
    }

    return bad(res, 500, "job failed", buildJobFailedResult(workerId, lockedId, e));
  }
}

module.exports = {
  handleJobsWorker,
  computeNatalCache,
  processOneNatalJob, // ← LINE側からの即時1回キックに使えるように出しておく
};
