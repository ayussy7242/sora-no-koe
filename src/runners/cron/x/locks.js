"use strict";

const crypto = require("crypto");
const { nowIso } = require("./utils");

const X_POST_LOCK_TTL_MS = 35 * 60 * 1000;

async function acquireXPostLock(db, kind, dateLocal, { force = false } = {}) {
  if (!db) return { ok: true, skipped: true, reason: "db_missing" };
  const runId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const ref = db.collection("cronLocks").doc(`x_post_${kind}_${dateLocal}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      const status = String(data.status || "");
      const startedAtMs = Number(data.startedAtMs || 0);
      const isStale = startedAtMs > 0 && (now - startedAtMs) > X_POST_LOCK_TTL_MS;
      if (status === "done" && !force) {
        return { ok: false, reason: "done", data };
      }
      if (status === "running" && !isStale) {
        return { ok: false, reason: "running", data };
      }
    }

    tx.set(ref, {
      status: "running",
      kind,
      date_local: dateLocal,
      runId,
      startedAtMs: now,
      startedAt: nowIso(now),
    }, { merge: true });

    return { ok: true, runId };
  });
}

async function markXPostLock(db, kind, dateLocal, patch) {
  if (!db) return;
  const ref = db.collection("cronLocks").doc(`x_post_${kind}_${dateLocal}`);
  const now = Date.now();
  await ref.set({
    ...patch,
    finishedAtMs: now,
    finishedAt: nowIso(now),
  }, { merge: true });
}

module.exports = {
  acquireXPostLock,
  markXPostLock,
  X_POST_LOCK_TTL_MS,
};
