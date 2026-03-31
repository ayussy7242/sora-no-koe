"use strict";

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Number.isFinite(Number(value))) return Number(value);
  return null;
}

function serverTimestamp(admin) {
  return admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date();
}

async function claimCronLock({ db, admin, id, ttlMs = 30 * 60 * 1000 } = {}) {
  if (!db) return { ok: true, skipped: true, reason: "db_missing" };
  if (!id) throw new Error("lock id missing");

  const ref = db.collection("cronLocks").doc(id);
  const nowMs = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const status = data?.status || "";
    const updatedMs = toMillis(data?.updated_at) || toMillis(data?.started_at);
    const ageMs = Number.isFinite(updatedMs) ? nowMs - updatedMs : null;
    const stale = Number.isFinite(ageMs) ? ageMs > ttlMs : false;

    if (status === "success") {
      return { ok: false, reason: "already_done", ref, data };
    }
    if (status === "running" && !stale) {
      return { ok: false, reason: "already_running", ref, data };
    }

    const attempts = Number.isFinite(Number(data?.attempts)) ? Number(data.attempts) + 1 : 1;
    tx.set(
      ref,
      {
        status: "running",
        attempts,
        started_at: serverTimestamp(admin),
        updated_at: serverTimestamp(admin),
      },
      { merge: true }
    );

    return { ok: true, ref };
  });
}

async function markCronLockSuccess({ ref, admin, extra } = {}) {
  if (!ref) return;
  await ref.set(
    {
      status: "success",
      finished_at: serverTimestamp(admin),
      updated_at: serverTimestamp(admin),
      ...(extra || {}),
    },
    { merge: true }
  );
}

async function markCronLockFailed({ ref, admin, error, extra } = {}) {
  if (!ref) return;
  await ref.set(
    {
      status: "failed",
      updated_at: serverTimestamp(admin),
      error: String(error || "unknown"),
      ...(extra || {}),
    },
    { merge: true }
  );
}

module.exports = {
  claimCronLock,
  markCronLockSuccess,
  markCronLockFailed,
};
