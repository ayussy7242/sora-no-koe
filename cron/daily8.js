
"use strict";

/**
 * cron/daily8.js
 * - 8時配信の本体（LINE push）
 * - posts_daily から本文を取り出して配信
 * - 配信ログを posts_daily_delivery に必ず残す
 */

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateLocalJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function toSafeText(x, maxLen = 4800) {
  const s = x == null ? "" : String(x);
  const t = s.length > maxLen ? s.slice(0, maxLen) : s;
  return t;
}

function isNonEmptyText(x) {
  const s = x == null ? "" : String(x);
  return s.trim().length > 0;
}

function envFlag(v, defaultOn = true) {
  if (v === undefined || v === null || v === "") return defaultOn;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
}

function makeRunId(dateLocal) {
  // 追跡用：日付 + ランダム
  const r = Math.random().toString(16).slice(2);
  return `daily8:${dateLocal}:${r}`;
}

async function linePushText({ accessToken, to, text }) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (typeof fetch !== "function") throw new Error("fetch not available (Node18+ required)");
  if (!to) throw new Error("line_user_id missing");
  const safe = toSafeText(text, 4800);
  if (!isNonEmptyText(safe)) throw new Error("text empty");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text: safe }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }

  // push は基本 body 空のことが多い
  const txt = await res.text().catch(() => "");
  return txt || null;
}

async function loadDailyText({ db, dateLocal }) {
  // posts_daily/{dateLocal} の texts.line を優先
  const snap = await db.collection("posts_daily").doc(dateLocal).get();
  if (!snap.exists) return { ok: false, reason: "posts_daily not found", text: null };
  const doc = snap.data() || {};
  const lineText = doc?.texts?.line || null;
  if (!isNonEmptyText(lineText)) return { ok: false, reason: "texts.line empty", text: null };
  return { ok: true, text: String(lineText) };
}

function getLineUserIdFromUserDoc(user) {
  // いまの形を想定：users/{id}.channels.line.line_user_id
  const a =
    user?.channels?.line?.line_user_id ||
    user?.channels?.line_user_id ||
    user?.line_user_id ||
    null;
  return a ? String(a) : null;
}

function isTargetUser(user) {
  // 送る条件（これ一択）
  const active = String(user?.profile?.status || user?.status || "active") === "active";
  const natalEnabled = user?.natal?.enabled === true;
  const daily8 = user?.natal?.delivery?.daily_8 === true;

  return { active, natalEnabled, daily8, ok: active && natalEnabled && daily8 };
}

async function writeDeliverySummary({ db, admin, dateLocal, runId, summary }) {
  const ref = db.collection("posts_daily_delivery").doc(dateLocal);
  await ref.set(
    {
      meta: {
        project: summary?.project || null,
        timezone: summary?.timezone || "Asia/Tokyo",
        schema_version: summary?.schema_version || null,
        date_local: dateLocal,
        generated_at_utc: new Date().toISOString(),
        run_id: runId,
        mode: "daily8",
      },
      source: {
        posts_daily_doc_id: dateLocal,
        texts_version: "render.v1",
      },
      targets: summary.targets,
      last_error: summary.last_error || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function writePerUserResult({ db, admin, dateLocal, appUserId, payload }) {
  const ref = db
    .collection("posts_daily_delivery")
    .doc(dateLocal)
    .collection("deliveries")
    .doc(appUserId);

  await ref.set(
    {
      app_user_id: appUserId,
      channel: "line",
      ...payload,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * runDaily8
 * deps: { db, admin, env }
 */
async function runDaily8(deps, opts = {}) {
  const { db, admin, env } = deps;
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");

  const LINE_ENABLED = envFlag(env.LINE_ENABLED, true);
  if (!LINE_ENABLED) {
    return { ok: true, skipped: true, reason: "LINE disabled" };
  }

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? opts.dateLocal : toDateLocalJST();
  const dryRun = opts.dryRun === true;

  const runId = makeRunId(dateLocal);

  // 1) 配信テキスト取得（posts_daily）
  const daily = await loadDailyText({ db, dateLocal });
  if (!daily.ok) {
    const summary = {
      project: env.PROJECT,
      timezone: env.DEFAULT_TZ,
      schema_version: env.SCHEMA_VERSION,
      targets: { planned: 0, attempted: 0, sent: 0, skipped: 0, failed: 0 },
      last_error: daily.reason,
    };
    await writeDeliverySummary({ db, admin, dateLocal, runId, summary });
    return { ok: false, error: daily.reason, date_local: dateLocal, run_id: runId };
  }

  const text = daily.text;

  // 2) 対象 users を取得（最短は “active & daily_8 true & natal.enabled true”）
  // ※ インデックス推奨（status, natal.enabled, natal.delivery.daily_8）
  const q = db
    .collection("users")
    .where("profile.status", "==", "active")
    .where("natal.enabled", "==", true)
    .where("natal.delivery.daily_8", "==", true);

  const snap = await q.get();

  let planned = snap.size;
  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;

  // 3) 1人ずつ配信（失敗しても止めない）
  for (const doc of snap.docs) {
    const appUserId = doc.id;
    const user = doc.data() || {};

    const cond = isTargetUser(user);
    const lineUserId = getLineUserIdFromUserDoc(user);

    if (!cond.ok) {
      skipped++;
      await writePerUserResult({
        db,
        admin,
        dateLocal,
        appUserId,
        payload: {
          status: "skipped",
          reason: `condition: active=${cond.active}, natal=${cond.natalEnabled}, daily8=${cond.daily8}`,
          line_user_id: lineUserId,
          text_len: text.length,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      continue;
    }

    if (!lineUserId) {
      skipped++;
      await writePerUserResult({
        db,
        admin,
        dateLocal,
        appUserId,
        payload: {
          status: "skipped",
          reason: "no line_user_id",
          line_user_id: null,
          text_len: text.length,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      continue;
    }

    attempted++;

    const startedAt = admin.firestore.FieldValue.serverTimestamp();

    try {
      if (!dryRun) {
        await linePushText({ accessToken, to: lineUserId, text });
      }

      sent++;
      await writePerUserResult({
        db,
        admin,
        dateLocal,
        appUserId,
        payload: {
          status: "sent",
          reason: dryRun ? "dry_run" : "ok",
          line_user_id: lineUserId,
          text_len: text.length,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: null,
        },
      });
    } catch (e) {
      failed++;
      await writePerUserResult({
        db,
        admin,
        dateLocal,
        appUserId,
        payload: {
          status: "failed",
          reason: "line_push_failed",
          line_user_id: lineUserId,
          text_len: text.length,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: e?.message || String(e),
        },
      });
    }
  }

  const summary = {
    project: env.PROJECT,
    timezone: env.DEFAULT_TZ,
    schema_version: env.SCHEMA_VERSION,
    targets: { planned, attempted, sent, skipped, failed },
    last_error: null,
  };

  await writeDeliverySummary({ db, admin, dateLocal, runId, summary });

  return { ok: true, date_local: dateLocal, run_id: runId, dry_run: dryRun, targets: summary.targets };
}

module.exports = { runDaily8 };
