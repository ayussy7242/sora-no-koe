"use strict";

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

function getDb() {
  // app側と同じDBに合わせる（envで切替できるように）
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
  return getFirestore(admin.app(), databaseId);
}

(async () => {
  if (!admin.apps.length) admin.initializeApp();

  const db = getDb();
  const docId = process.argv[2] || "public-2025-12-30";

  const snap = await db.collection("stories").doc(docId).get();
  const d = snap.data() || {};

  console.log("docId:", docId);
  console.log("exists:", snap.exists);
  console.log("has outputs:", Object.prototype.hasOwnProperty.call(d, "outputs"));
  console.log("outputs:", d.outputs);
})();
