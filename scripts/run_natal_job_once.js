"use strict";

const swisseph = require("swisseph");
const { admin, getDb } = require("../config/firebase");
const { processOneNatalJob } = require("../jobs/worker");

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

(async () => {
  const appUserId = getArg("app_user_id");
  if (!appUserId) throw new Error("Missing --app_user_id=...");

  const db = getDb();
  const jobRef = db.collection("jobs_natal_calc").doc(appUserId);
  const snap = await jobRef.get();
  if (!snap.exists) throw new Error("jobs_natal_calc not found for app_user_id");

  const job = snap.data() || {};
  if (job.status !== "queued" && job.status !== "running") {
    console.log("⚠️ job status is not queued/running:", job.status);
  }

  try {
    const result = await processOneNatalJob(
      { db, admin, swisseph, env: process.env },
      { job, job_id: appUserId }
    );

    await jobRef.set(
      {
        status: "done",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        finished_at: admin.firestore.FieldValue.serverTimestamp(),
        lease_until: null,
        last_result: result || null,
      },
      { merge: true }
    );

    console.log("✅ processed:", appUserId);
    console.log(result);
  } catch (e) {
    await jobRef.set(
      {
        status: "failed",
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        finished_at: admin.firestore.FieldValue.serverTimestamp(),
        lease_until: null,
        error: e?.message || String(e),
      },
      { merge: true }
    );
    throw e;
  }
})();
