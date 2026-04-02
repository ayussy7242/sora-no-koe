"use strict";

const { resetStaleRunningJobs, lockOneQueuedJob } = require("./lease");

async function lockNextJob(ctx) {
  const { db, admin, jobsCol, config, workerId } = ctx;

  if (config.RESET_STALE) {
    try {
      await resetStaleRunningJobs({ db, admin, jobsCol, limit: config.STALE_LIMIT });
    } catch (e) {
      console.log("[worker] stale reset skipped:", e?.message || String(e));
    }
  }

  return lockOneQueuedJob({
    db,
    admin,
    jobsCol,
    maxAttempts: config.MAX_ATTEMPTS,
    leaseMinutes: config.LEASE_MINUTES,
    workerId,
  });
}

module.exports = {
  lockNextJob,
};
