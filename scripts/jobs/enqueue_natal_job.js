"use strict";

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
}

(async () => {
  const projectId = getArg("project_id") || process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const appUserId = getArg("app_user_id");
  if (!projectId) throw new Error("Missing project id");
  if (!appUserId) throw new Error("Missing --app_user_id=...");

  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = getFirestore(admin.app(), "sora-no-koe-db");

  // natal_cacheからbirthを引っ張って job に入れる（手入力ゼロ）
  const snap = await db.collection("natal_cache").doc(appUserId).get();
  if (!snap.exists) throw new Error("natal_cache not found");

  const birth = snap.data().birth || {};
  const ref = db.collection("jobs_natal_calc").doc();

  await ref.set({
    status: "queued",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    attempts: 0,
    app_user_id: appUserId,
    birth,
  });

  console.log("✅ enqueued:", ref.id, "app_user_id:", appUserId);
})();
