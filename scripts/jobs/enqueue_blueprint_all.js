"use strict";

require("../_load_env");

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const env = require("../../src/config/env");
const { enqueueBlueprintGenerate } = require("../../src/integrations/cloudtasks/tasks_queue");
const { getLineUserIdFromUserDoc } = require("../../src/runners/cron/cron_utils");

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
}

function toBool(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

async function isLineActive(db, lineUserId) {
  if (!lineUserId) return false;
  const snap = await db.collection("line_users").doc(lineUserId).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  return data?.is_active !== false;
}

(async () => {
  const projectId =
    getArg("project_id") || process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("Missing project id");

  const dryRun = !toBool(getArg("run"));
  const forceRegen = toBool(getArg("force_regen"));
  const includeInactive = toBool(getArg("include_inactive"));
  const limit = Number(getArg("limit") || 0) || null;
  const ownerOnly = toBool(getArg("owner_only"));
  const lineUserIdArg = getArg("line_user_id");

  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = getFirestore(admin.app(), "sora-no-koe-db");

  const enqueueOne = async (lineUserId) => {
    if (!lineUserId) return { ok: false, error: "line_user_id missing" };
    if (!includeInactive) {
      const active = await isLineActive(db, lineUserId);
      if (!active) return { ok: false, error: "inactive" };
    }
    if (dryRun) return { ok: true, dryRun: true };
    await enqueueBlueprintGenerate({
      env,
      lineUserId,
      blueprintType: "light",
      forceRegen,
      extraPayload: { forcePush: true },
    });
    return { ok: true };
  };

  if (lineUserIdArg) {
    const r = await enqueueOne(lineUserIdArg);
    console.log("✅ enqueue_blueprint_all done");
    console.log({
      dry_run: dryRun,
      scanned: 1,
      attempted: 1,
      queued: r.ok ? 1 : 0,
      skipped: r.ok ? 0 : 1,
      failed: r.ok ? 0 : 1,
      last_error: r.ok ? null : r.error || "enqueue_failed",
    });
    return;
  }

  if (ownerOnly) {
    const ownerLineUserId = env.OWNER_LINE_USER_ID || null;
    if (!ownerLineUserId) throw new Error("OWNER_LINE_USER_ID not set");
    const r = await enqueueOne(ownerLineUserId);
    console.log("✅ enqueue_blueprint_all done");
    console.log({
      dry_run: dryRun,
      scanned: 1,
      attempted: 1,
      queued: r.ok ? 1 : 0,
      skipped: r.ok ? 0 : 1,
      failed: r.ok ? 0 : 1,
      last_error: r.ok ? null : r.error || "enqueue_failed",
    });
    return;
  }

  const qsnap = await db
    .collection("users")
    .where("status", "==", "active")
    .where("natal.enabled", "==", true)
    .get();

  let scanned = 0;
  let attempted = 0;
  let queued = 0;
  let skipped = 0;
  let failed = 0;
  let lastError = null;

  for (const doc of qsnap.docs) {
    if (limit && attempted >= limit) break;
    scanned += 1;
    const user = doc.data() || {};
    const lineUserId = getLineUserIdFromUserDoc(user);
    if (!lineUserId) {
      skipped += 1;
      continue;
    }
    try {
      attempted += 1;
      const r = await enqueueOne(lineUserId);
      if (r.ok) queued += 1;
      else skipped += 1;
    } catch (e) {
      failed += 1;
      lastError = e?.message || String(e);
      console.log("[enqueue_blueprint_all] enqueue failed:", {
        line_user_id: lineUserId,
        error: lastError,
      });
    }
  }

  console.log("✅ enqueue_blueprint_all done");
  console.log({
    dry_run: dryRun,
    scanned,
    attempted,
    queued,
    skipped,
    failed,
    last_error: lastError,
  });
})();
