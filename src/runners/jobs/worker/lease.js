"use strict";

const { minutes, nowMs, nowDate } = require("./utils");
const { JOB_STATUS } = require("../../../domain/lifecycle/enums");

async function resetStaleRunningJobs({ db, admin, jobsCol, limit = 10 }) {
  const staleQ = await jobsCol
    .where("status", "==", JOB_STATUS.RUNNING)
    .where("lease_expires_at", "<", nowDate())
    .limit(limit)
    .get();

  if (staleQ.empty) return { reset: 0 };

  const batch = db.batch();
  staleQ.docs.forEach((d) => {
    batch.set(
      d.ref,
      {
        status: JOB_STATUS.QUEUED,
        last_error: "stale lease reset",
        worker_id: null,
        lease_expires_at: null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await batch.commit();
  return { reset: staleQ.docs.length };
}

/**
 * queued を1件だけロックして返す
 * @returns { lockedRef, lockedId, lockedJob } or null
 */
async function lockOneQueuedJob({ db, admin, jobsCol, maxAttempts, leaseMinutes, workerId }) {
  let lockedRef = null;
  let lockedId = null;
  let lockedJob = null;

  await db.runTransaction(async (tx) => {
    const q = await tx.get(
      jobsCol.where("status", "==", JOB_STATUS.QUEUED).orderBy("created_at", "asc").limit(1)
    );
    if (q.empty) return;

    const doc = q.docs[0];
    const ref = doc.ref;
    const job = doc.data() || {};
    const attempts = Number(job.attempts || 0);

    if (attempts >= maxAttempts) {
      tx.set(
        ref,
        {
          status: JOB_STATUS.FAILED,
          last_error: `max attempts reached (${attempts})`,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return;
    }

    if (job.status !== JOB_STATUS.QUEUED) return;

    const leaseExpiresAt = new Date(nowMs() + minutes(leaseMinutes));

    tx.set(
      ref,
      {
        status: JOB_STATUS.RUNNING,
        attempts: attempts + 1,
        worker_id: workerId,
        lease_expires_at: leaseExpiresAt,
        started_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    lockedRef = ref;
    lockedId = doc.id;
    lockedJob = job;
  });

  if (!lockedRef) return null;
  return { lockedRef, lockedId, lockedJob };
}

async function finalizeJobDone({ admin, lockedRef, workerId }) {
  await lockedRef.set(
    {
      status: JOB_STATUS.SUCCESS,
      last_error: null,
      worker_id: workerId,
      finished_at: admin.firestore.FieldValue.serverTimestamp(),
      lease_expires_at: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function finalizeJobFailed({ admin, lockedRef, workerId, error }) {
  await lockedRef.set(
    {
      status: JOB_STATUS.FAILED,
      last_error: error?.message ? String(error.message) : String(error),
      worker_id: workerId,
      finished_at: admin.firestore.FieldValue.serverTimestamp(),
      lease_expires_at: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = {
  resetStaleRunningJobs,
  lockOneQueuedJob,
  finalizeJobDone,
  finalizeJobFailed,
};
