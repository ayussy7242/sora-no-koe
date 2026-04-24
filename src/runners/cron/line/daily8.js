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

const path = require("path");
const {
  isYYYYMMDD,
  toDateLocalJST,
  isNonEmptyText,
  pickNum,
  clamp,
  getLineUserIdFromUserDoc,
} = require("../cron_utils");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const dict = require("../../../content/dict");
const { buildDailyLinePayload } = require("./planning");
const { buildObservationMeta } = require("../../../usecases/story/observation_meta");
const { linePushText, linePushImage, writeDeliverySummary, writePerUserResult } = require("./publish");
const { writeLocalLineOutputs } = require("./io");

// Temporary: disable sorazu image push in daily 08:00
const DISABLE_DAILY8_SORA_IMAGE = true;
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
function envFlag(v, defaultOn = true) {
  if (v === undefined || v === null || v === "") return defaultOn;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
}
function makeRunId(dateLocal) {
  const r = Math.random().toString(16).slice(2);
  return `daily8:${dateLocal}:${r}`;
}

function writeLocalDaily8Outputs({ outDir, dateLocal, mode, target, items, summary }) {
  const dir = outDir || path.join(process.cwd(), "tmp", "line", "daily8", dateLocal || "unknown");
  const payload = {
    date_local: dateLocal,
    mode,
    target,
    summary: summary || null,
    items: Array.isArray(items) ? items : [],
  };
  return writeLocalLineOutputs({ outDir: dir, summary: payload, items });
}

function isTargetUser(user) {
  const active = String(user?.status || "active") === "active";
  const natalEnabled = user?.natal?.enabled === true;
  const daily8 = user?.natal?.delivery?.daily_8 === true;
  return { active, natalEnabled, daily8, ok: active && natalEnabled && daily8 };
}

/**
 * runDaily8
 * deps: { db, admin, env, storyService, renderers }
 * opts: { dateLocal?, dryRun?/dry_run?, mode?, target?, orbMaxDeg?, precisionDeg? }
 */
async function runDaily8(deps, opts = {}) {
  const { db, admin, env, storyService, storage } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");

  const env2 = resolveEnv(env);
  opts = normalizeOpts(opts);

  const LINE_ENABLED = envFlag(env2.LINE_ENABLED, true);
  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const dryRun = toBool(opts.dryRun ?? opts.dry_run, false);
  const debugEnabled = toBool(opts.debug ?? opts.debugFlag ?? env2.DAILY8_DEBUG, false);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.DAILY8_LOCAL_ONLY,
    false
  );
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.DAILY8_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "line", "daily8", dateLocal || "unknown")
  );
  const runDry = dryRun || localOnly;
  const runId = makeRunId(dateLocal);

  const modeRaw = String(opts.mode ?? "today").trim().toLowerCase();
  const targetRaw = String(opts.target ?? "all").trim().toLowerCase();

  const mode = modeRaw === "sky" ? "sky" : "today";
  const target = targetRaw === "owner" ? "owner" : "all";

  const accessToken = env2.LINE_CHANNEL_ACCESS_TOKEN;
  const wheelExpireDays = Number(env2.SORA_WHEEL_URL_EXPIRES_DAYS ?? 2);

  if (!LINE_ENABLED && !localOnly) {
    return { ok: true, skipped: true, reason: "LINE disabled", date_local: dateLocal, dry_run: runDry, mode, target };
  }

  const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
  const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

  const localItems = [];

  async function buildPayloadFor({ appUserId, lineUserId }) {
    const asOfISO = new Date().toISOString();
    const payload = await buildDailyLinePayload({
      db,
      env: env2,
      storyService,
      storage,
      dict,
      dateLocal,
      appUserId,
      lineUserId,
      orbMaxDeg,
      precisionDeg,
      wheelExpireDays,
      allowWheel: !DISABLE_DAILY8_SORA_IMAGE,
      allowWheelWhenLocal: true,
      localOnly,
      asOfISO,
    });
    if (runDry || debugEnabled) {
      payload.observation_meta = buildObservationMeta({
        story: payload?.story || null,
        dict,
        asOfISO,
        dateLocal,
      });
    }
    return payload;
  }

  async function deliverOne({ appUserId, lineUserId }) {
    const startedAt = admin.firestore.FieldValue.serverTimestamp();
    try {
      const payload = await buildPayloadFor({ appUserId, lineUserId });
      const outText = payload?.text || "";
      const resonanceDebug = payload?.resonance_debug || null;
      if (!isNonEmptyText(outText)) throw new Error("outText empty");

      if (localOnly) {
        localItems.push({
          app_user_id: appUserId,
          line_user_id: lineUserId,
          text: outText,
          text_len: String(outText).length,
          image_url: payload?.imageUrl || null,
          is_paid_500: !!payload?.isPaid500,
          mode,
          target,
          resonance_debug: resonanceDebug,
          observation_meta: payload?.observation_meta || null,
        });
        return { ok: true };
      }

      if (!runDry) {
        await linePushText({ accessToken, to: lineUserId, text: outText });
        if (payload?.imageUrl) {
          await linePushImage({ accessToken, to: lineUserId, imageUrl: payload.imageUrl });
        }
      }

      if (!localOnly) {
        await writePerUserResult({
          db,
          admin,
          dateLocal,
          appUserId,
          payload: {
            status: "sent",
            reason: runDry ? "dry_run" : "ok",
            line_user_id: lineUserId,
            text_len: String(outText).length,
            created_at: startedAt,
            finished_at: admin.firestore.FieldValue.serverTimestamp(),
            error: null,
            mode,
            target,
            dry_run: runDry,
          },
        });
      }

      if (runDry || debugEnabled) {
        return { ok: true, resonance_debug: resonanceDebug, observation_meta: payload?.observation_meta || null };
      }
      return { ok: true };
    } catch (e) {
      if (localOnly) {
        localItems.push({
          app_user_id: appUserId,
          line_user_id: lineUserId,
          text: "",
          text_len: 0,
          image_url: null,
          is_paid_500: false,
          mode,
          target,
          resonance_debug: null,
          error: e?.message || String(e),
        });
        return { ok: false, error: e?.message || String(e) };
      }

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
          dry_run: runDry,
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
    if (localOnly) {
      const local = writeLocalDaily8Outputs({
        outDir: localOutDir,
        dateLocal,
        mode,
        target,
        items: localItems,
        summary,
      });
      return {
        ok: r.ok,
        date_local: dateLocal,
        run_id: runId,
        dry_run: runDry,
        local_only: true,
        local_dir: local.dir,
        local_paths: local.text_paths,
        summary_path: local.summary_path,
        targets: summary.targets,
        mode,
        target,
        error: summary.last_error,
        observation_meta: localItems[0]?.observation_meta || null,
      };
    }

    await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });

    const result = { ok: r.ok, date_local: dateLocal, run_id: runId, dry_run: runDry, targets: summary.targets, mode, target, error: summary.last_error };
    if (runDry || debugEnabled) {
      result.resonance_debug = r?.resonance_debug || null;
      result.observation_meta = r?.observation_meta || null;
    }
    return result;
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
      if (!localOnly) {
        await writePerUserResult({
          db, admin, dateLocal, appUserId,
          payload: { status: "skipped", reason: `condition: active=${cond.active}, natal=${cond.natalEnabled}, daily8=${cond.daily8}`, line_user_id: lineUserId, text_len: 0, finished_at: admin.firestore.FieldValue.serverTimestamp(), mode, target, dry_run: runDry },
        });
      }
      continue;
    }

    if (!lineUserId) {
      skipped++;
      if (!localOnly) {
        await writePerUserResult({
          db, admin, dateLocal, appUserId,
          payload: { status: "skipped", reason: "no line_user_id", line_user_id: null, text_len: 0, finished_at: admin.firestore.FieldValue.serverTimestamp(), mode, target, dry_run: runDry },
        });
      }
      continue;
    }

    attempted++;
    const r = await deliverOne({ appUserId, lineUserId });
    if (r.ok) sent++;
    else { failed++; lastError = r.error || lastError; }
  }

  const summary = { targets: { planned, attempted, sent, skipped, failed }, last_error: lastError };
  if (localOnly) {
    const local = writeLocalDaily8Outputs({
      outDir: localOutDir,
      dateLocal,
      mode,
      target,
      items: localItems,
      summary,
    });
    return {
      ok: failed === 0,
      date_local: dateLocal,
      run_id: runId,
      dry_run: runDry,
      local_only: true,
      local_dir: local.dir,
      local_paths: local.text_paths,
      summary_path: local.summary_path,
      targets: summary.targets,
      mode,
      target,
      error: lastError,
      observation_meta: localItems[0]?.observation_meta || null,
    };
  }

  await writeDeliverySummary({ db, admin, env, dateLocal, runId, summary, mode, target });

  const result = { ok: failed === 0, date_local: dateLocal, run_id: runId, dry_run: runDry, targets: summary.targets, mode, target, error: lastError };
  if (runDry || debugEnabled) {
    result.observation_meta = localItems[0]?.observation_meta || null;
  }
  return result;
}

module.exports = { runDaily8 };
