"use strict";

/**
 * Update line_users membership.deep_mode for all users.
 *
 * Usage (dry-run by default):
 *   DRY_RUN=1 node scripts/update_deep_mode.js
 *
 * Apply changes:
 *   DRY_RUN=0 node scripts/update_deep_mode.js
 *
 * Allow list (line_user_id):
 *   DEEP_MODE_ALLOW_LINE_USER_IDS=Uxxx,Uyyy
 */

const { admin, getDb } = require("../config/firebase");

function listEnv(key, fallback = []) {
  const v = process.env[key];
  if (!v) return fallback;
  return String(v)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const db = getDb();
  const allowIds = new Set(listEnv("DEEP_MODE_ALLOW_LINE_USER_IDS"));
  const dryRun = !["0", "false", "off"].includes(String(process.env.DRY_RUN || "1").toLowerCase());
  const batchLimit = 400;

  let total = 0;
  let allowCount = 0;
  let denyCount = 0;
  let batch = db.batch();
  let batchSize = 0;

  let lastDoc = null;
  while (true) {
    let q = db.collection("line_users").orderBy(admin.firestore.FieldPath.documentId()).limit(batchLimit);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const lineUserId = doc.id;
      const deepMode = allowIds.has(lineUserId);
      total += 1;
      if (deepMode) allowCount += 1;
      else denyCount += 1;

      if (!dryRun) {
        batch.set(
          doc.ref,
          {
            membership: {
              deep_mode: deepMode,
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        batchSize += 1;
        if (batchSize >= batchLimit) {
          await batch.commit();
          batch = db.batch();
          batchSize = 0;
        }
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  if (!dryRun && batchSize > 0) {
    await batch.commit();
  }

  console.log("[deep_mode] done", {
    dryRun,
    total,
    deep_mode_true: allowCount,
    deep_mode_false: denyCount,
    allow_list_size: allowIds.size,
  });
}

main().catch((err) => {
  console.error("[deep_mode] failed:", err);
  process.exit(1);
});
