/**
 * scripts/reset_user.js
 * Usage:
 *   node scripts/reset_user.js --line_user_id=Uxxxx --app_user_id=u_me_xxx --wipe_stories=true --wipe_events=false
 */
"use strict";

const fb = require("../config/firebase"); // { admin, getDb }
const admin = fb.admin;
const db = fb.getDb();
const { FieldPath } = require("firebase-admin/firestore");

function arg(name, def = null) {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}
function boolArg(name, def = false) {
  const v = arg(name, null);
  if (v == null) return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

async function deleteDocsByIdPrefix(colName, prefix) {
  // Firestore prefix query: __name__ >= prefix && __name__ <= prefix+'\uf8ff'
  const start = prefix;
  const end = prefix + "\uf8ff";
  const snap = await db
    .collection(colName)
    .where(FieldPath.documentId(), ">=", start)
    .where(FieldPath.documentId(), "<=", end)
    .get();

  if (snap.empty) return 0;

  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return count;
}

async function deleteDocsByField(colName, field, value) {
  const snap = await db.collection(colName).where(field, "==", value).get();
  if (snap.empty) return 0;

  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return count;
}

(async () => {
  const line_user_id = arg("line_user_id");
  const app_user_id = arg("app_user_id"); // u_me_xxx
  const wipe_stories = boolArg("wipe_stories", true);
  const wipe_events = boolArg("wipe_events", false);
  const wipe_jobs = boolArg("wipe_jobs", true);

  if (!line_user_id) throw new Error("--line_user_id is required");

  console.log("🔁 reset start:", { line_user_id, app_user_id, wipe_stories, wipe_events, wipe_jobs });

  // 1) line_users を「最初から」へ（ここが最重要）
  await db.collection("line_users").doc(line_user_id).set(
    {
      status: "pending_birth_date",
      // profileは必要最低限に戻す（line_profile は残してOK）
      profile: {
        birth_date: null,
        birth_time: null,
        birth_place: null,
        lat: null,
        lon: null,
        timezone: "Asia/Tokyo",
      },
      app_user_id: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log("✅ line_users reset -> pending_birth_date");

  if (app_user_id) {
    // 2) users / natal_cache を削除
    await db.collection("users").doc(app_user_id).delete().catch(() => {});
    await db.collection("natal_cache").doc(app_user_id).delete().catch(() => {});
    console.log("✅ deleted users/natal_cache:", app_user_id);

    // 3) stories（prefixで消す）
    if (wipe_stories) {
      const n = await deleteDocsByIdPrefix("stories", `${app_user_id}-`);
      console.log("✅ deleted stories:", n);
    }

    // 4) jobs（line_user_id or app_user_id で消す）
    if (wipe_jobs) {
      const n1 = await deleteDocsByField("jobs_natal_calc", "app_user_id", app_user_id);
      const n2 = await deleteDocsByField("jobs_natal_calc", "line_user_id", line_user_id);
      console.log("✅ deleted jobs_natal_calc:", { by_app_user_id: n1, by_line_user_id: n2 });
    }
  } else {
    console.log("ℹ️ app_user_id not provided -> skipped users/natal_cache/stories/jobs wipe");
  }

  // 5) line_events は基本残してOK（重いなら wipe_events=trueで消す）
  if (wipe_events) {
    const n = await deleteDocsByIdPrefix("line_events", `${line_user_id}-`);
    console.log("✅ deleted line_events:", n);
  }

  console.log("🎉 reset done");
})().catch((e) => {
  console.error("❌ reset failed:", e);
  process.exit(1);
});
