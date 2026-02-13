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

const { normalizeStoryArgs } = require("../engine/story_args");
const {
  isYYYYMMDD,
  toDateLocalJST,
  asOfIsoFromDateLocalJST,
  toSafeText,
  isNonEmptyText,
  pickMode,
  pickTarget,
  pickNum,
  clamp,
  getLineUserIdFromUserDoc,
  pickRenderer,
} = require("./cron_utils");

function makeRunId(dateLocal) {
  const r = Math.random().toString(16).slice(2);
  return `rebuild8:${dateLocal}:${r}`;
}

async function rebuildDaily8(deps, opts = {}) {
  const { db, admin, env, storyService, renderers } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const mode = pickMode(opts.mode);
  const target = pickTarget(opts.target);
  const asOfISO = asOfIsoFromDateLocalJST(dateLocal);
  const runId = makeRunId(dateLocal);

  // daily8 と同じく、オーブ等のパラメータも受け取れるようにする（互換＆将来拡張）
  const orbMaxDeg = clamp(pickNum(opts.orbMaxDeg, 6), 0.1, 12);
  const precisionDeg = clamp(pickNum(opts.precisionDeg, 0.01), 0.001, 1);

  const renderFn = pickRenderer(renderers);
  if (!renderFn) throw new Error("no renderer found (need one of: renderKyou/renderToday/renderLineToday/renderLine)");

  // outbox root
  const outboxRoot = db.collection("posts_daily_outbox").doc(dateLocal).collection("items");

  async function buildTextFor(appUserId) {
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

    // mode=today
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

  // 共通: outbox に書くペイロード生成
  function makeOutboxPayload({ appUserId, lineUserId, text }) {
    return {
      app_user_id: appUserId,
      line_user_id: lineUserId,
      mode,
      text,
      text_len: text.length,
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

    const text = toSafeText(await buildTextFor(ownerAppUserId));
    if (!isNonEmptyText(text)) throw new Error("text empty");

    await outboxRoot.doc(ownerAppUserId).set(
      makeOutboxPayload({ appUserId: ownerAppUserId, lineUserId: ownerLineUserId, text }),
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
      const text = toSafeText(await buildTextFor(appUserId));
      if (!isNonEmptyText(text)) {
        skipped++;
        continue;
      }

      await outboxRoot.doc(appUserId).set(
        makeOutboxPayload({ appUserId, lineUserId, text }),
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
