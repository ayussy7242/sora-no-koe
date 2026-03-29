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

const { normalizeStoryArgs } = require("../../usecases/story/story_args");
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

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const mode = pickMode(opts.mode);
  const target = pickTarget(opts.target);
  const asOfISO = new Date().toISOString();
  const runId = makeRunId(dateLocal);

  // daily8 と同じく、オーブ等のパラメータも受け取れるようにする（互換＆将来拡張）
  const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
  const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

  const bucketName = env.GCS_BUCKET_SORA || env.GCS_BUCKET_BLUEPRINTS || null;
  const wheelExpireDays = Number(env.SORA_WHEEL_URL_EXPIRES_DAYS ?? 2);

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
    if (isPaid500 && storage && bucketName) {
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

    await outboxRoot.doc(ownerAppUserId).set(
      makeOutboxPayload({
        appUserId: ownerAppUserId,
        lineUserId: ownerLineUserId,
        text,
        isPaid500: payload?.isPaid500,
        imageUrl: payload?.imageUrl,
        imagePath: payload?.imagePath,
      }),
      { merge: true }
    );

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

      await outboxRoot.doc(appUserId).set(
        makeOutboxPayload({
          appUserId,
          lineUserId,
          text,
          isPaid500: payload?.isPaid500,
          imageUrl: payload?.imageUrl,
          imagePath: payload?.imagePath,
        }),
        { merge: true }
      );

      prepared++;
    } catch (e) {
      failed++;
      lastError = e?.message || String(e);
      // 失敗しても全体を止めない（運用向け）
      // 必要ならここで "rebuildログ" コレクションを追加してもOK
    }
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
