"use strict";

const { acquireCronLockCore, markCronLockCore } = require("../../../usecases/cron/locks");

async function acquireCronLock(db, id, { force = false, ttlMs = 30 * 60 * 1000, meta = null } = {}) {
  const res = await acquireCronLockCore({ db, id, ttlMs, force, meta });
  if (!res.ok) return { ok: false, reason: res.reason, data: res.data };
  return { ok: true, runId: res.runId, ref: res.ref };
}

async function markCronLock(db, id, patch) {
  return markCronLockCore({ db, id, patch });
}

module.exports = {
  acquireCronLock,
  markCronLock,
};
