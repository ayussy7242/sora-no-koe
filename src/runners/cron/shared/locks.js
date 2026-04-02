"use strict";

const crypto = require("crypto");
const { nowIso } = require("./utils");

function createRunId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function resolveCronLockRef(db, id) {
  return db.collection("cronLocks").doc(id);
}

async function acquireCronLock(db, id, { force = false, ttlMs = 30 * 60 * 1000, meta = null } = {}) {
  if (!db) return { ok: true, skipped: true, reason: "db_missing" };
  if (!id) throw new Error("lock id missing");

  const runId = createRunId();
  const ref = resolveCronLockRef(db, id);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      const status = String(data.status || "");
      const startedAtMs = Number(data.startedAtMs || 0);
      const isStale = startedAtMs > 0 && (now - startedAtMs) > ttlMs;
      if (status === "done" && !force) {
        return { ok: false, reason: "done", data };
      }
      if (status === "running" && !isStale) {
        return { ok: false, reason: "running", data };
      }
    }

    tx.set(ref, {
      status: "running",
      runId,
      startedAtMs: now,
      startedAt: nowIso(now),
      ...(meta || {}),
    }, { merge: true });

    return { ok: true, runId, ref };
  });
}

async function markCronLock(db, id, patch) {
  if (!db || !id) return null;
  const ref = resolveCronLockRef(db, id);
  const now = Date.now();
  await ref.set({
    ...patch,
    finishedAtMs: now,
    finishedAt: nowIso(now),
  }, { merge: true });
  return ref;
}

module.exports = {
  acquireCronLock,
  markCronLock,
};
