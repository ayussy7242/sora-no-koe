"use strict";

/**
 * cron/daily8.js (legacy / unified sender)
 *
 * Role:
 * - 旧方式：対象抽出 → story生成 → renderer → LINE push を1ジョブで完結させる。
 *
 * Current Policy (IMPORTANT):
 * - 運用は rebuild8 (07:58) + send8 (08:00) に分割したため、
 *   daily8 は通常スケジュールから外す（同時実行による二重送信防止）。
 *
 * Use Cases:
 * - 手動テスト / 一時的な緊急配信 / outbox方式へ移行する前の互換運用
 *
 * Logs:
 * - posts_daily_delivery/{dateLocal}/deliveries/{appUserId} に送信結果を記録
 */

const { normalizeStoryArgs } = require("../engine/story_args");
const {
  isYYYYMMDD,
  toDateLocalJST,
  asOfIsoFromDateLocalJST,
  toSafeText,
  isNonEmptyText,
  pickNum,
  clamp,
  getLineUserIdFromUserDoc,
  pickRenderer,
} = require("./cron_utils");
function normalizeOpts(input) {
  if (!input) return {};
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}
function toBool(v, defaultValue = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
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

// -------------------- LINE --------------------
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
    body: JSON.stringify({ to, messages: [{ type: "text", text: safe }] }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }
  return (await res.text().catch(() => "")) || null;
}

function isTargetUser(user) {
  const active = String(user?.status || "active") === "active";
  const natalEnabled = user?.natal?.enabled === true;
  const daily8 = user?.natal?.delivery?.daily_8 === true;
  return { active, natalEnabled, daily8, ok: active && natalEnabled && daily8 };
}

// -------------------- logs --------------------
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
        job: "daily8",
        delivery_mode: mode, // today | sky
        target: target,      // all | owner
      },
      targets: summary.targets,
      last_error: summary.last_error || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function writePerUserResult({ db, admin, dateLocal, appUserId, payload }) {
  const ref = db.collection("posts_daily_delivery").doc(dateLocal).collection("deliveries").doc(appUserId);
  await ref.set(
    { app_user_id: appUserId, channel: "line", ...payload, updated_at: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * runDaily8
 * deps: { db, admin, env, storyService, renderers }
 * opts: { dateLocal?, dryRun?/dry_run?, mode?, target?, orbMaxDeg?, precisionDeg? }
 */
async function runDaily8(deps, opts = {}) {
  const { db, admin, env, storyService, renderers } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");

  opts = normalizeOpts(opts);

  const LINE_ENABLED = envFlag(env.LINE_ENABLED, true);
  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const dryRun = toBool(opts.dryRun ?? opts.dry_run, false);
  const runId = makeRunId(dateLocal);

  const modeRaw = String(opts.mode ?? "today").trim().toLowerCase();
  const targetRaw = String(opts.target ?? "all").trim().toLowerCase();

  const mode = modeRaw === "sky" ? "sky" : "today";
  const target = targetRaw === "owner" ? "owner" : "all";

  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  const renderFn = pickRenderer(renderers);
  if (!renderFn) throw new Error("no renderer found (need renderLine or today renderer)");

  if (!LINE_ENABLED) {
    return { ok: true, skipped: true, reason: "LINE disabled", date_local: dateLocal, dry_run: dryRun, mode, target };
  }

  const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
  const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

  async function buildTextFor(appUserId) {
    const asOfISO = asOfIsoFromDateLocalJST(dateLocal);

    if (mode === "sky") {
      const story = await storyService.buildStoryForUser(
        normalizeStoryArgs({
          appUserId: "public",
          mode: "public",
          dateLocal,
          asOfISO,
          orbMaxDeg,
          precisionDeg,
        })
      );
      return await renderFn(story);
    }

    // mode === "today" => auto
    const story = await storyService.buildStoryForUser(
      normalizeStoryArgs({
        appUserId,
        mode: "auto",
        dateLocal,
        asOfISO,
        orbMaxDeg,
        precisionDeg,
      })
    );
    return await renderFn(story);
  }

  async function deliverOne({ appUserId, lineUserId }) {
    const startedAt = admin.firestore.FieldValue.serverTimestamp();
    try {
      const outText = await buildTextFor(appUserId);
      if (!isNonEmptyText(outText)) throw new Error("outText empty");

      if (!dryRun) {
        await linePushText({ accessToken, to: lineUserId, text: outText });
      }

      await writePerUserResult({
        db,
        admin,
        dateLocal,
        appUserId,
        payload: {
          status: "sent",
          reason: dryRun ? "dry_run" : "ok",
          line_user_id: lineUserId,
          text_len: String(outText).length,
          created_at: startedAt,
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          error: null,
          mode,
          target,
          dry_run: dryRun,
        },
      });

      return { ok: true };
    } catch (e) {
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
          dry_run: dryRun,
        },
      });
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // ---------- target=owner ----------
  if (target === "owner") {
    const ownerLineUserId = env.OWNER_LINE_USER_ID;
    const ownerAppUserId = env.OWNER_APP_USER_ID;
    if (!ownerLineUserId) throw new Error("OWNER_LINE_USER_ID not set");
    if (!ownerAppUserId) throw new Error("OWNER_APP_USER_ID not set");

    const planned = 1;
    let attempted = 1, sent = 0, skipped = 0, failed = 0;

    const r = await deliverOne({ appUserId: ownerAppUserId, lineUserId: ownerLineUserId });
    if (r.ok) sent++;
    else failed++;

    const summary = { targets: { planned, attempted, sent, skipped, failed }, last_error: r.ok ? null : r.error };
    await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });

    return { ok: r.ok, date_local: dateLocal, run_id: runId, dry_run: dryRun, targets: summary.targets, mode, target, error: summary.last_error };
  }

  // ---------- target=all ----------
  const qsnap = await db
    .collection("users")
    .where("status", "==", "active")
    .where("natal.enabled", "==", true)
    .where("natal.delivery.daily_8", "==", true)
    .get();

  const planned = qsnap.size;
  let attempted = 0, sent = 0, skipped = 0, failed = 0;
  let lastError = null;

  for (const doc of qsnap.docs) {
    const appUserId = doc.id;
    const user = doc.data() || {};

    const cond = isTargetUser(user);
    const lineUserId = getLineUserIdFromUserDoc(user);

    if (!cond.ok) {
      skipped++;
      await writePerUserResult({
        db, admin, dateLocal, appUserId,
        payload: { status: "skipped", reason: `condition: active=${cond.active}, natal=${cond.natalEnabled}, daily8=${cond.daily8}`, line_user_id: lineUserId, text_len: 0, finished_at: admin.firestore.FieldValue.serverTimestamp(), mode, target, dry_run: dryRun },
      });
      continue;
    }

    if (!lineUserId) {
      skipped++;
      await writePerUserResult({
        db, admin, dateLocal, appUserId,
        payload: { status: "skipped", reason: "no line_user_id", line_user_id: null, text_len: 0, finished_at: admin.firestore.FieldValue.serverTimestamp(), mode, target, dry_run: dryRun },
      });
      continue;
    }

    attempted++;
    const r = await deliverOne({ appUserId, lineUserId });
    if (r.ok) sent++;
    else { failed++; lastError = r.error || lastError; }
  }

  const summary = { targets: { planned, attempted, sent, skipped, failed }, last_error: lastError };
  await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });

  return { ok: failed === 0, date_local: dateLocal, run_id: runId, dry_run: dryRun, targets: summary.targets, mode, target, error: lastError };
}

module.exports = { runDaily8 };
