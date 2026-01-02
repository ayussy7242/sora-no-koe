"use strict";

/**
 * cron/daily8.js
 * - 8時配信の本体（LINE push）
 * - mode:
 *    - "today": ユーザーごとに buildStoryForUser → renderLine（あなたの🪐×今日のそら）
 *    - "sky"  : posts_daily/{dateLocal}.texts.line を配信（そら）
 * - target:
 *    - "all"  : users 条件に合う全員
 *    - "owner": env.OWNER_LINE_USER_ID のみ（デバッグ用）
 * - 配信ログ posts_daily_delivery/{dateLocal} + /deliveries/{appUserId} に保存
 */

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateLocalJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function asOfIsoFromDateLocalJST(dateLocal) {
  // JST 12:00 基準にするならここ変える。いまは 03:00Z（= JST 12:00）に固定してる設計を踏襲
  return `${dateLocal}T03:00:00.000Z`;
}

function toSafeText(x, maxLen = 4800) {
  const s = x == null ? "" : String(x);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
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

  const txt = await res.text().catch(() => "");
  return txt || null;
}

async function loadDailyTextFromPostsDaily({ db, dateLocal }) {
  // posts_daily/{dateLocal}.texts.line を読む（= sky）
  const snap = await db.collection("posts_daily").doc(dateLocal).get();
  if (!snap.exists) return { ok: false, reason: "posts_daily not found", text: null };
  const doc = snap.data() || {};
  const lineText = doc?.texts?.line || null;
  if (!isNonEmptyText(lineText)) return { ok: false, reason: "texts.line empty", text: null };
  return { ok: true, text: String(lineText) };
}

function getLineUserIdFromUserDoc(user) {
  const a =
    user?.channels?.line?.line_user_id ||
    user?.channels?.line_user_id ||
    user?.line_user_id ||
    null;
  return a ? String(a) : null;
}

function isTargetUser(user) {
  const active = String(user?.status || "active") === "active";
  const natalEnabled = user?.natal?.enabled === true;
  const daily8 = user?.natal?.delivery?.daily_8 === true;
  return { active, natalEnabled, daily8, ok: active && natalEnabled && daily8 };
}

async function writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target }) {
  const ref = db.collection("posts_daily_delivery").doc(dateLocal);
  await ref.set(
    {
      meta: {
        project: env.PROJECT || null,
        timezone: env.DEFAULT_TZ || "Asia/Tokyo",
        schema_version: env.SCHEMA_VERSION || null,
        date_local: dateLocal,
        generated_at_utc: new Date().toISOString(),
        run_id: runId,
        mode: "daily8",
        delivery_mode: mode,   // "today" | "sky"
        target: target,        // "all" | "owner"
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

function pickNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * runDaily8
 * deps: { db, admin, env, storyService, renderers }
 */
async function runDaily8(deps, opts = {}) {
  const { db, admin, env, storyService, renderers } = deps;

  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");

  const LINE_ENABLED = envFlag(env.LINE_ENABLED, true);
  if (!LINE_ENABLED) {
    return { ok: true, skipped: true, reason: "LINE disabled" };
  }

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const dryRun = opts.dryRun === true;
  const runId = makeRunId(dateLocal);

  const mode = String(opts.mode || "today");     // "today" | "sky"
  const target = String(opts.target || "all");   // "all" | "owner"

  // mode=today は deps に storyService/renderers 必須
  if (mode === "today") {
    if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing (required for mode=today)");
    if (!renderers?.renderLine) throw new Error("deps.renderers.renderLine is missing (required for mode=today)");
  }

  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;

  // 事前に sky の本文を取っておく（全員共通）
  let skyText = null;
  if (mode === "sky") {
    const daily = await loadDailyTextFromPostsDaily({ db, dateLocal });
    if (!daily.ok) {
      const summary = {
        targets: { planned: 0, attempted: 0, sent: 0, skipped: 0, failed: 0 },
        last_error: daily.reason,
      };
      await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });
      return { ok: false, error: daily.reason, date_local: dateLocal, run_id: runId, mode, target };
    }
    skyText = daily.text;
  }

  // --------------------
  // target=owner（デバッグ用）
  // --------------------
  if (target === "owner") {
    const ownerLineUserId = env.OWNER_LINE_USER_ID;
    if (!ownerLineUserId) throw new Error("OWNER_LINE_USER_ID not set");

    const planned = 1;
    let attempted = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    const appUserId = "owner";
    attempted++;

    const startedAt = admin.firestore.FieldValue.serverTimestamp();

    try {
      let outText = null;

      if (mode === "sky") {
        outText = skyText;
      } else {
        // today: owner は public ではなく、ownerのユーザーIDが無いので "public" で作るか、
        // 将来 owner を users に紐付けるならここ差し替え
        const fallbackAppUserId = env.OWNER_APP_USER_ID || "public";
        const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
        const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

        const story = await storyService.buildStoryForUser({
          appUserId: fallbackAppUserId,
          dateLocal,
          asOfISO: asOfIsoFromDateLocalJST(dateLocal),
          orbMaxDeg,
          precisionDeg,
        });

        outText = renderers.renderLine(story);
      }

      if (!isNonEmptyText(outText)) throw new Error("outText empty");

      if (!dryRun) {
        await linePushText({ accessToken, to: ownerLineUserId, text: outText });
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
          line_user_id: ownerLineUserId,
          text_len: outText.length,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: null,
          mode,
          target,
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
          line_user_id: ownerLineUserId,
          text_len: 0,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: e?.message || String(e),
          mode,
          target,
        },
      });
    }

    const summary = {
      targets: { planned, attempted, sent, skipped, failed },
      last_error: null,
    };

    await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });
    return { ok: true, date_local: dateLocal, run_id: runId, dry_run: dryRun, targets: summary.targets, mode, target };
  }

  // --------------------
  // target=all（本番）
  // --------------------
  const qsnap = await db
    .collection("users")
    .where("status", "==", "active")
    .where("natal.enabled", "==", true)
    .where("natal.delivery.daily_8", "==", true)
    .get();

  const planned = qsnap.size;
  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of qsnap.docs) {
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
          text_len: 0,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          mode,
          target,
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
          text_len: 0,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          mode,
          target,
        },
      });
      continue;
    }

    attempted++;
    const startedAt = admin.firestore.FieldValue.serverTimestamp();

    try {
      let outText = null;

      if (mode === "sky") {
        outText = skyText;
      } else {
        // today: ユーザーごとに生成（あなたの🪐×今日のそら）
        const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
        const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

        const story = await storyService.buildStoryForUser({
          appUserId,
          dateLocal,
          asOfISO: asOfIsoFromDateLocalJST(dateLocal),
          orbMaxDeg,
          precisionDeg,
        });

        outText = renderers.renderLine(story);
      }

      if (!isNonEmptyText(outText)) throw new Error("outText empty");

      if (!dryRun) {
        await linePushText({ accessToken, to: lineUserId, text: outText });
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
          text_len: outText.length,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: null,
          mode,
          target,
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
          text_len: 0,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: e?.message || String(e),
          mode,
          target,
        },
      });
    }
  }

  const summary = {
    targets: { planned, attempted, sent, skipped, failed },
    last_error: null,
  };

  await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });

  return { ok: true, date_local: dateLocal, run_id: runId, dry_run: dryRun, targets: summary.targets, mode, target };
}

module.exports = { runDaily8 };
