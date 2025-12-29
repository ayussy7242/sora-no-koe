// tools/reset_user.js
"use strict";

const fb = require("../config/firebase");
const db = fb.getDb();

function nowIso() {
  return new Date().toISOString();
}

async function deleteIfExists(ref) {
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

async function run() {
  const app_user_id = process.env.APP_USER_ID; // 例: u_me_xxx
  const line_user_id = process.env.LINE_USER_ID; // 例: Ue98...
  const date_local = process.env.DATE_LOCAL; // 例: 2025-12-30（stories消す用、任意）
  const mode = process.env.MODE || "soft"; // soft | hard

  if (!app_user_id && !line_user_id) {
    throw new Error("APP_USER_ID or LINE_USER_ID is required");
  }

  const report = {
    mode,
    app_user_id,
    line_user_id,
    date_local,
    deleted: {},
    updated: {},
    at: nowIso(),
  };

  // 1) line_users reset
  if (line_user_id) {
    const ref = db.collection("line_users").doc(line_user_id);
    if (mode === "hard") {
      report.deleted.line_users = await deleteIfExists(ref);
    } else {
      await ref.set(
        {
          status: "pending_birth_date",
          consent_version: null,
          consented_at: null,
          profile: {},
          birth_date: null,
          birth_time: null,
          birth_place: null,
          app_user_id: app_user_id || null, // あれば紐づけ維持
          updated_at: nowIso(),
        },
        { merge: true }
      );
      report.updated.line_users = true;
    }
  }

  // 2) users reset（運用してるなら）
  if (app_user_id) {
    const ref = db.collection("users").doc(app_user_id);
    if (mode === "hard") {
      report.deleted.users = await deleteIfExists(ref);
    } else {
      await ref.set(
        {
          status: "pending_birth_date",
          consent_version: null,
          consented_at: null,
          updated_at: nowIso(),
        },
        { merge: true }
      );
      report.updated.users = true;
    }
  }

  // 3) natal_cache reset（最初からやるなら消すのが気持ちいい）
  if (app_user_id) {
    const ref = db.collection("natal_cache").doc(app_user_id);
    if (mode === "hard") {
      report.deleted.natal_cache = await deleteIfExists(ref);
    } else {
      // softでも「最初から感」を出すなら消すのが◎
      report.deleted.natal_cache = await deleteIfExists(ref);
    }
  }

  // 4) stories reset（指定日だけ消す）
  if (app_user_id && date_local) {
    const docId = `${app_user_id}-${date_local}`;
    const ref = db.collection("stories").doc(docId);
    report.deleted.stories = await deleteIfExists(ref);
  }

  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

run().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
  process.exit(1);
});
