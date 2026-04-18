"use strict";

const { acquireCronLockCore, markCronLockCore } = require("./locks");
const { CRON_STATUS } = require("../../domain/lifecycle/enums");

async function claimCronLock({ db, admin, id, ttlMs = 30 * 60 * 1000 } = {}) {
  const res = await acquireCronLockCore({ db, admin, id, ttlMs });
  if (!res.ok) {
    const reason =
      res.reason === "done"
        ? "already_done"
        : res.reason === "running"
          ? "already_running"
          : res.reason || "unknown";
    return { ok: false, reason, ref: res.ref, data: res.data };
  }
  return { ok: true, ref: res.ref };
}

async function markCronLockSuccess({ ref, admin, extra } = {}) {
  if (!ref) return;
  await markCronLockCore({ ref, admin, status: CRON_STATUS.SUCCESS, patch: extra });
}

async function markCronLockFailed({ ref, admin, error, extra } = {}) {
  if (!ref) return;
  await markCronLockCore({ ref, admin, status: CRON_STATUS.FAILED, patch: { error: String(error || "unknown"), ...(extra || {}) } });
}

module.exports = {
  claimCronLock,
  markCronLockSuccess,
  markCronLockFailed,
};
