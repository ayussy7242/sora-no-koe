#!/usr/bin/env node
/**
 * reset_user.js
 * - line_users を登録途中(pending_birth_date)へ戻す
 * - users / natal_cache / stories / jobs を必要に応じて削除
 *
 * Usage:
 * node scripts/reset_user.js \
 *   --line_user_id=Uxxxx \
 *   --app_user_id=u_me_xxx \
 *   --wipe_stories=true \
 *   --wipe_events=false \
 *   --wipe_jobs=true
 */

"use strict";

const fb = require("../src/integrations/firebase/firebase");
const db = fb.getDb();
const admin = fb.admin;

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2];
    if (v === "true") v = true;
    if (v === "false") v = false;
    out[k] = v;
  }
  return out;
}

function nowTs() {
  return admin.firestore.Timestamp.now();
}

async function deleteDocsByIdPrefix(colName, prefix) {
  const col = db.collection(colName);
  const docs = await col.listDocuments(); // NOTE: small-scale運用前提
  const targets = docs.filter((d) => d.id.startsWith(prefix));
  if (targets.length === 0) return 0;

  const BATCH_LIMIT = 450; // safety
  let deleted = 0;

  for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = targets.slice(i, i + BATCH_LIMIT);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteDocsByQuery(colName, query, label) {
  let snap = await query.get();
  if (snap.empty) return 0;

  const BATCH_LIMIT = 450;
  let deleted = 0;
  let docs = snap.docs;

  while (docs.length) {
    const batch = db.batch();
    const chunk = docs.slice(0, BATCH_LIMIT);
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
    deleted += chunk.length;

    // 続き（多い場合）
    const last = chunk[chunk.length - 1];
    snap = await query.startAfter(last).get();
    docs = snap.docs;
  }

  return deleted;
}

async function main() {
  const args = parseArgs(process.argv);

  const line_user_id = args.line_user_id;
  const app_user_id = args.app_user_id;

  if (!line_user_id && !app_user_id) {
    console.error("❌ need --line_user_id=... and/or --app_user_id=...");
    process.exit(1);
  }

  const wipeStories = args.wipe_stories ?? false;
  const wipeEvents = args.wipe_events ?? false;
  const wipeJobs = args.wipe_jobs ?? false;

  console.log("🔁 reset start");
  console.log({ line_user_id, app_user_id, wipeStories, wipeEvents, wipeJobs });

  // 1) line_users を pending に戻す（ここが最重要）
  if (line_user_id) {
    const ref = db.collection("line_users").doc(line_user_id);
    await ref.set(
      {
        status: "pending_birth_date",
        profile: admin.firestore.FieldValue.delete(), // 入力済みプロフィール消す
        meta: {
          last_reset_at: nowTs(),
        },
        updated_at: nowTs(),
      },
      { merge: true }
    );
    console.log("✅ line_users reset -> pending_birth_date:", line_user_id);
  }

  // 2) users を消す（任意だが、最初から体験したいなら消すのはアリ）
  if (app_user_id) {
    await db.collection("users").doc(app_user_id).delete().catch(() => {});
    console.log("✅ users deleted:", app_user_id);
  }

  // 3) natal_cache を消す（これ消すと “あなたの座標” が無くなる＝再計算が必要）
  if (app_user_id) {
    await db.collection("natal_cache").doc(app_user_id).delete().catch(() => {});
    console.log("✅ natal_cache deleted:", app_user_id);
  }

  // 4) stories を消す（app_user_id-YYYY-MM-DD 形式想定）
  if (wipeStories && app_user_id) {
    const n = await deleteDocsByIdPrefix("stories", `${app_user_id}-`);
    console.log("✅ stories deleted:", n);
  }

  // 5) line_events を消す（line_user_id-... 形式想定）
  if (wipeEvents && line_user_id) {
    const n = await deleteDocsByIdPrefix("line_events", `${line_user_id}-`);
    console.log("✅ line_events deleted:", n);
  }

  // 6) jobs_natal_calc を消す（whereで消す）
  if (wipeJobs) {
    let total = 0;
    if (app_user_id) {
      total += await deleteDocsByQuery(
        "jobs_natal_calc",
        db.collection("jobs_natal_calc").where("app_user_id", "==", app_user_id),
        "jobs_natal_calc(app_user_id)"
      );
    }
    if (line_user_id) {
      total += await deleteDocsByQuery(
        "jobs_natal_calc",
        db.collection("jobs_natal_calc").where("line_user_id", "==", line_user_id),
        "jobs_natal_calc(line_user_id)"
      );
    }
    console.log("✅ jobs_natal_calc deleted:", total);
  }

  console.log("🎉 reset done");
}

main().catch((e) => {
  console.error("❌ reset failed:", e);
  process.exit(1);
});
