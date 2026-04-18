"use strict";

const { JOB_STATUS } = require("../../../../domain/lifecycle/enums");

function getJobRef(db, lineUserId) {
  return db.collection("jobs").doc("blueprint_light").collection("items").doc(lineUserId);
}

async function markFailed({ db, admin, lineUserId, stage, error, extra } = {}) {
  if (!lineUserId) return;
  const ref = getJobRef(db, lineUserId);
  await ref.set(
    {
      status: JOB_STATUS.FAILED,
      stage: stage || "worker",
      error: String(error || "unknown_error"),
      extra: extra || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function getNowMillis() {
  return Date.now();
}

function isLeaseActive(job, nowMs) {
  const leaseUntil = job?.lease_until;
  if (!leaseUntil) return false;
  const leaseMs = typeof leaseUntil.toMillis === "function" ? leaseUntil.toMillis() : Number(leaseUntil);
  return Number.isFinite(leaseMs) && leaseMs > nowMs;
}

function nextLeaseMs(nowMs, minutes = 15) {
  return new Date(nowMs + minutes * 60 * 1000);
}

module.exports = {
  getJobRef,
  markFailed,
  getNowMillis,
  isLeaseActive,
  nextLeaseMs,
};
