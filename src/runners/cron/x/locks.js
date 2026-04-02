"use strict";

const { acquireCronLock, markCronLock } = require("../shared/locks");

const X_POST_LOCK_TTL_MS = 35 * 60 * 1000;
const X_RESONANCE_RECENT_ID = "x_resonance_recent";
const X_RESONANCE_RECENT_LIMIT = 7;

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

async function getXResonanceRecentKeys(db) {
  if (!db) return [];
  const ref = db.collection("cronLocks").doc(X_RESONANCE_RECENT_ID);
  const snap = await ref.get();
  if (!snap.exists) return [];
  const data = snap.data() || {};
  return Array.isArray(data.keys) ? data.keys.filter(Boolean) : [];
}

async function pushXResonanceRecentKey(db, key, { limit = X_RESONANCE_RECENT_LIMIT } = {}) {
  if (!db || !key) return [];
  const ref = db.collection("cronLocks").doc(X_RESONANCE_RECENT_ID);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};
  const prev = Array.isArray(data.keys) ? data.keys.filter(Boolean) : [];
  const next = [key, ...prev.filter((k) => k !== key)].slice(0, limit);
  await ref.set({ keys: next }, { merge: true });
  return next;
}

module.exports = {
  acquireXPostLock,
  markXPostLock,
  X_POST_LOCK_TTL_MS,
  X_RESONANCE_RECENT_ID,
  X_RESONANCE_RECENT_LIMIT,
  getXResonanceRecentKeys,
  pushXResonanceRecentKey,
};
