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

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function toDateLocalJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
function asOfIsoFromDateLocalJST(dateLocal) {
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
function normLower(x, fallback = "") {
  const s = x == null ? "" : String(x);
  const t = s.trim().toLowerCase();
  return t || fallback;
}
function pickMode(x) {
  const m = normLower(x, "today");
  return m === "sky" ? "sky" : "today";
}
function pickTarget(x) {
  const t = normLower(x, "all");
  return t === "owner" ? "owner" : "all";
}
function pickNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function makeRunId(dateLocal) {
  const r = Math.random().toString(16).slice(2);
  return `rebuild8:${dateLocal}:${r}`;
}
function getLineUserIdFromUserDoc(user) {
  const a =
    user?.channels?.line?.line_user_id ||
    user?.channels?.line_user_id ||
    user?.line_user_id ||
    null;
  return a ? String(a) : null;
}

/**
 * renderer picker
 * - daily8 と同じ思想：存在するものを優先順で拾う
 * - これにより「renderer差し替えたのに rebuild だけ反映されない」を防ぐ
 */
function pickRenderer(renderers) {
  if (typeof renderers?.renderKyou === "function") return renderers.renderKyou.bind(renderers);
  if (typeof renderers?.renderToday === "function") return renderers.renderToday.bind(renderers);
  if (typeof renderers?.renderLineToday === "function") return renderers.renderLineToday.bind(renderers);
  if (typeof renderers?.renderLine === "function") return renderers.renderLine.bind(renderers);
  return null;
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
