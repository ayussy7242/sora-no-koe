"use strict";

const { acquireCronLock, markCronLock } = require("../shared/locks");

const X_POST_LOCK_TTL_MS = 35 * 60 * 1000;

async function acquireXPostLock(db, kind, dateLocal, { force = false } = {}) {
  return acquireCronLock(db, `x_post_${kind}_${dateLocal}`, {
    force,
    ttlMs: X_POST_LOCK_TTL_MS,
    meta: {
      kind,
      date_local: dateLocal,
    },
  });
}

async function markXPostLock(db, kind, dateLocal, patch) {
  return markCronLock(db, `x_post_${kind}_${dateLocal}`, patch);
}

module.exports = {
  acquireXPostLock,
  markXPostLock,
  X_POST_LOCK_TTL_MS,
};
