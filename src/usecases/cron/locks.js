"use strict";

const crypto = require("crypto");
const { CRON_STATUS, normalizeCompletionStatus } = require("../../domain/lifecycle/enums");

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function createRunId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function resolveCronLockRef(db, id) {
  return db.collection("cronLocks").doc(id);
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Number.isFinite(Number(value))) return Number(value);
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function serverTimestamp(admin) {
  return admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : null;
}

function normalizeStatus(status) {
  return normalizeCompletionStatus(status);
}

function resolveUpdatedMs(data = {}) {
  const startedAtMs = toMillis(data.startedAtMs);
  if (Number.isFinite(startedAtMs)) return startedAtMs;
  const updatedAt = toMillis(data.updated_at);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const startedAt = toMillis(data.started_at);
  if (Number.isFinite(startedAt)) return startedAt;
  const startedAtIso = toMillis(data.startedAt);
  if (Number.isFinite(startedAtIso)) return startedAtIso;
  const finishedAtMs = toMillis(data.finishedAtMs);
  if (Number.isFinite(finishedAtMs)) return finishedAtMs;
  const finishedAt = toMillis(data.finishedAt);
  if (Number.isFinite(finishedAt)) return finishedAt;
  return null;
}

async function acquireCronLockCore({
  db,
  admin,
  id,
  ttlMs = 30 * 60 * 1000,
  force = false,
  meta = null,
} = {}) {
  if (!db) return { ok: true, skipped: true, reason: "db_missing" };
  if (!id) throw new Error("lock id missing");

  const runId = createRunId();
  const ref = resolveCronLockRef(db, id);
  const nowMs = Date.now();
  const startedAtTs = serverTimestamp(admin);
  const updatedAtTs = serverTimestamp(admin);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    if (snap.exists) {
      const status = normalizeStatus(data.status || "");
      const updatedMs = resolveUpdatedMs(data);
      const stale = Number.isFinite(updatedMs) ? (nowMs - updatedMs) > ttlMs : false;
      if (status === CRON_STATUS.SUCCESS && !force) {
        return { ok: false, reason: "done", data, ref };
      }
      if (status === CRON_STATUS.RUNNING && !stale) {
        return { ok: false, reason: "running", data, ref };
      }
    }

    const attempts = Number.isFinite(Number(data.attempts))
      ? Number(data.attempts) + 1
      : 1;

    const payload = {
      status: CRON_STATUS.RUNNING,
      runId,
      startedAtMs: nowMs,
      startedAt: nowIso(nowMs),
      attempts,
      ...(meta || {}),
    };
    if (startedAtTs) payload.started_at = startedAtTs;
    if (updatedAtTs) payload.updated_at = updatedAtTs;

    tx.set(ref, payload, { merge: true });
    return { ok: true, runId, ref };
  });
}

async function markCronLockCore({ db, ref, id, status, patch, admin } = {}) {
  if (!ref) {
    if (!db || !id) return null;
    ref = resolveCronLockRef(db, id);
  }
  const nowMs = Date.now();
  const finishedAtTs = serverTimestamp(admin);
  const updatedAtTs = serverTimestamp(admin);

  const payload = {
    ...(patch || {}),
    ...(status ? { status } : {}),
    finishedAtMs: nowMs,
    finishedAt: nowIso(nowMs),
  };
  if (finishedAtTs) payload.finished_at = finishedAtTs;
  if (updatedAtTs) payload.updated_at = updatedAtTs;

  await ref.set(payload, { merge: true });
  return ref;
}

module.exports = {
  acquireCronLockCore,
  markCronLockCore,
  resolveCronLockRef,
  normalizeStatus,
};
