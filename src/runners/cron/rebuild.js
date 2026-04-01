/**
 * cron/rebuild.js (rebuild8)
 *
 * Purpose:
 * - 配信前（例: 07:58）に実行して、当日分の配信テキストを “作り直す”
 * - story 再生成 → renderer で text 再生成 → posts_daily_outbox に保存
 *
 * Design:
 * - rebuild は “送らない”（pushしない）。生成と格納だけ。
 * - send8 が outbox を読むだけなので、配信直前に最新へ更新できる。
 *
 * Targets:
 * - target=owner : OWNER_APP_USER_ID / OWNER_LINE_USER_ID の 1件だけ outbox 作成
 * - target=all   : users 条件に合う全員の outbox を作成（line_user_id 必須）
 *
 * Modes:
 * - mode=today : appUserId ごとの personal(today) を生成して outbox に保存
 * - mode=sky   : public(sky) を生成して outbox に保存（全員同一の空）
 *
 * Firestore:
 * - posts_daily_outbox/{dateLocal}/items/{appUserId}
 *   fields: { app_user_id, line_user_id, mode, text, text_len, prepared_at, run_id, ... }
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeStoryArgs } = require("../../usecases/story/args");
const {
  isYYYYMMDD,
  toDateLocalJST,
  toSafeText,
  isNonEmptyText,
  pickMode,
  pickTarget,
  pickNum,
  clamp,
  getLineUserIdFromUserDoc,
} = require("./cron_utils");
const dict = require("../../content/dict");
const { buildDailyLineMessage } = require("../../usecases/channels/line/daily_message");
const { getLineSubscription, isPaidLine500 } = require("../../integrations/firebase/subscription");
const { buildAndStoreSoraWheel } = require("../../engine/graphics/sora_wheel");

function makeRunId(dateLocal) {
  const r = Math.random().toString(16).slice(2);
  return `rebuild8:${dateLocal}:${r}`;
}

function toBool(v, defaultValue = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFilePart(value, fallback) {
  const s = String(value || "").trim();
  const cleaned = s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function writeLocalRebuildOutputs({ outDir, dateLocal, mode, target, items, summary }) {
  const dir = outDir || path.join(process.cwd(), "tmp", "line", "rebuild8", dateLocal || "unknown");
  ensureDir(dir);
  const payload = {
    date_local: dateLocal,
    mode,
    target,
    summary: summary || null,
    items: Array.isArray(items) ? items : [],
  };
  const summaryPath = path.join(dir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2));
  const textPaths = [];
  (Array.isArray(items) ? items : []).forEach((item, idx) => {
    const name = safeFilePart(item?.app_user_id || item?.line_user_id || `item_${idx + 1}`, `item_${idx + 1}`);
    const textPath = path.join(dir, `${name}.txt`);
    fs.writeFileSync(textPath, String(item?.text || ""), "utf8");
    textPaths.push(textPath);
  });
  return { dir, summary_path: summaryPath, text_paths: textPaths };
}

async function getLineUserDeepMode(db, lineUserId) {
  if (!db || !lineUserId) return false;
  try {
    const snap = await db.collection("line_users").doc(lineUserId).get();
    if (!snap.exists) return false;
    const d = snap.data() || {};
    return d?.membership?.deep_mode === true;
  } catch (_) {
    return false;
  }
}

async function rebuildDaily8(deps, opts = {}) {
  const { db, admin, env, storyService, storage } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const mode = pickMode(opts.mode);
  const target = pickTarget(opts.target);
  const localOnly = toBool(
    opts.local ?? opts.local_only ?? opts.localOnly ?? env2.REBUILD8_LOCAL_ONLY,
    false
  );
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.REBUILD8_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "line", "rebuild8", dateLocal || "unknown")
  );
  const asOfISO = new Date().toISOString();
  const runId = makeRunId(dateLocal);

  // daily8 と同じく、オーブ等のパラメータも受け取れるようにする（互換＆将来拡張）
  const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
  const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

  const bucketName = env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS || null;
  const wheelExpireDays = Number(env2.SORA_WHEEL_URL_EXPIRES_DAYS ?? 2);

  function isPaidAllowed({ appUserId, lineUserId }) {
    if (!env.PAID_MODE_ENABLED) return true;
    if (env.PAID_ALLOW_OWNER) {
      if (env.OWNER_LINE_USER_ID && lineUserId === env.OWNER_LINE_USER_ID) return true;
      if (env.OWNER_APP_USER_ID && appUserId === env.OWNER_APP_USER_ID) return true;
    }
    if (appUserId && env.PAID_ALLOW_APP_USER_IDS?.includes(appUserId)) return true;
    if (lineUserId && env.PAID_ALLOW_LINE_USER_IDS?.includes(lineUserId)) return true;
    return false;
  }

  // outbox root
  const outboxRoot = db.collection("posts_daily_outbox").doc(dateLocal).collection("items");
  const localItems = [];

  async function buildMessageFor({ appUserId, lineUserId }) {
    // mode=today (fixed: daily combines sky + personal)
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

    let paid = false;
    try {
      const sub = await getLineSubscription(db, lineUserId);
      paid = isPaidLine500(sub);
    } catch (_) {
      paid = false;
    }
    const allow = isPaidAllowed({ appUserId, lineUserId });
    const isPaid500 = paid || allow;

    const deepMode = await getLineUserDeepMode(db, lineUserId);
    const text = toSafeText(await buildDailyLineMessage({ story, dict, isPaid500, deepMode }));

    let imageUrl = null;
    let imagePath = null;
    if (!localOnly && isPaid500 && storage && bucketName) {
      try {
        const wheel = await buildAndStoreSoraWheel({
          storage,
          bucketName,
          lineUserId,
          dateLocal,
          story,
          dateLabel: String(dateLocal || "").replace(/-/g, "."),
          expiresDays: wheelExpireDays,
        });
        if (wheel?.ok && wheel?.url) {
          imageUrl = wheel.url;
          imagePath = wheel.path || null;
        }
      } catch (_) {
        imageUrl = null;
        imagePath = null;
      }
    }

    return { text, isPaid500, imageUrl, imagePath };
  }

  // 共通: outbox に書くペイロード生成
  function makeOutboxPayload({ appUserId, lineUserId, text, isPaid500, imageUrl, imagePath }) {
    return {
      app_user_id: appUserId,
      line_user_id: lineUserId,
      mode,
      text,
      text_len: text.length,
      is_paid_500: !!isPaid500,
      image_url: imageUrl || null,
      image_path: imagePath || null,
      prepared_at: admin.firestore.FieldValue.serverTimestamp(),
      // 運用・デバッグ用
      run_id: runId,
      meta: {
        job: "rebuild8",
        date_local: dateLocal,
        as_of_iso: asOfISO,
        orb_max_deg: orbMaxDeg,
        precision_deg: precisionDeg,
        schema_version: env.SCHEMA_VERSION || null,
      },
    };
  }

  // ---- target=owner ----
  if (target === "owner") {
    const ownerAppUserId = env.OWNER_APP_USER_ID;
    const ownerLineUserId = env.OWNER_LINE_USER_ID;
    if (!ownerAppUserId) throw new Error("OWNER_APP_USER_ID not set");
    if (!ownerLineUserId) throw new Error("OWNER_LINE_USER_ID not set");

    const payload = await buildMessageFor({ appUserId: ownerAppUserId, lineUserId: ownerLineUserId });
    const text = payload?.text || "";
    if (!isNonEmptyText(text)) throw new Error("text empty");

    const item = makeOutboxPayload({
      appUserId: ownerAppUserId,
      lineUserId: ownerLineUserId,
      text,
      isPaid500: payload?.isPaid500,
      imageUrl: payload?.imageUrl,
      imagePath: payload?.imagePath,
    });

    if (localOnly) {
      localItems.push(item);
      const summary = { targets: { planned: 1, prepared: 1, skipped: 0, failed: 0 }, last_error: null };
      const local = writeLocalRebuildOutputs({
        outDir: localOutDir,
        dateLocal,
        mode,
        target,
        items: localItems,
        summary,
      });
      return {
        ok: true,
        date_local: dateLocal,
        mode,
        target,
        prepared: 1,
        skipped: 0,
        run_id: runId,
        local_only: true,
        local_dir: local.dir,
        local_paths: local.text_paths,
        summary_path: local.summary_path,
      };
    }

    await outboxRoot.doc(ownerAppUserId).set(item, { merge: true });

    return { ok: true, date_local: dateLocal, mode, target, prepared: 1, skipped: 0, run_id: runId };
  }

  // ---- target=all ----
  const qsnap = await db
    .collection("users")
    .where("status", "==", "active")
    .where("natal.enabled", "==", true)
    .where("natal.delivery.daily_8", "==", true)
    .get();

  let prepared = 0;
  let skipped = 0;
  let failed = 0;
  let lastError = null;

  for (const doc of qsnap.docs) {
    const appUserId = doc.id;
    const user = doc.data() || {};
    const lineUserId = getLineUserIdFromUserDoc(user);

    if (!lineUserId) {
      skipped++;
      continue;
    }

    try {
      const payload = await buildMessageFor({ appUserId, lineUserId });
      const text = payload?.text || "";
      if (!isNonEmptyText(text)) {
        skipped++;
        continue;
      }

      const item = makeOutboxPayload({
        appUserId,
        lineUserId,
        text,
        isPaid500: payload?.isPaid500,
        imageUrl: payload?.imageUrl,
        imagePath: payload?.imagePath,
      });
      if (localOnly) {
        localItems.push(item);
      } else {
        await outboxRoot.doc(appUserId).set(item, { merge: true });
      }

      prepared++;
    } catch (e) {
      failed++;
      lastError = e?.message || String(e);
      // 失敗しても全体を止めない（運用向け）
      // 必要ならここで "rebuildログ" コレクションを追加してもOK
    }
  }

  if (localOnly) {
    const summary = { targets: { planned: prepared + skipped + failed, prepared, skipped, failed }, last_error: lastError };
    const local = writeLocalRebuildOutputs({
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
      mode,
      target,
      prepared,
      skipped,
      failed,
      run_id: runId,
      error: lastError,
      local_only: true,
      local_dir: local.dir,
      local_paths: local.text_paths,
      summary_path: local.summary_path,
    };
  }

  return {
    ok: failed === 0,
    date_local: dateLocal,
    mode,
    target,
    prepared,
    skipped,
    failed,
    run_id: runId,
    error: lastError,
  };
}

module.exports = { rebuildDaily8 };
