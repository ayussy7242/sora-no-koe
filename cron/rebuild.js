/**
 * cron/rebuild.js (rebuild8)
 *
 * Purpose:
 * - 07:58 など「配信前」に実行して、当日分の配信テキストを "作り直す"。
 * - story 再生成 → renderer で text 再生成 → posts_daily_outbox に保存。
 *
 * Design:
 * - rebuild は "送らない"（pushしない）。生成と格納だけ。
 * - send8 が outbox を配るため、配信直前に必ず最新化できる。
 *
 * Targets:
 * - target=owner : OWNER_APP_USER_ID / OWNER_LINE_USER_ID の1件だけ outbox 作成
 * - target=all   : users 条件に合う全員の outbox を作成（line_user_id 必須）
 *
 * Modes:
 * - mode=today : appUserId ごとの personal(today) を生成して outbox に保存
 * - mode=sky   : public(sky) を生成して outbox に保存（全員同一の空）
 *
 * Notes:
 * - Firestore: posts_daily_outbox/{dateLocal}/items/{appUserId}
 * - text_len / prepared_at を保存して運用ログに使える
 */


"use strict";

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
function getLineUserIdFromUserDoc(user) {
  const a = user?.channels?.line?.line_user_id || user?.channels?.line_user_id || user?.line_user_id || null;
  return a ? String(a) : null;
}

async function rebuildDaily8(deps, opts = {}) {
  const { db, admin, env, storyService, renderers } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (typeof renderers?.renderLine !== "function") throw new Error("renderers.renderLine missing");

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const mode = pickMode(opts.mode);
  const target = pickTarget(opts.target);
  const asOfISO = asOfIsoFromDateLocalJST(dateLocal);

  // outbox root
  const outboxRoot = db.collection("posts_daily_outbox").doc(dateLocal).collection("items");

  async function buildTextFor(appUserId) {
    if (mode === "sky") {
      const story = await storyService.buildStoryForUser({
        appUserId: "public",
        mode: "public",
        dateLocal,
        asOfISO,
      });
      return renderers.renderLine(story);
    }
    const story = await storyService.buildStoryForUser({
      appUserId,
      mode: "auto",
      dateLocal,
      asOfISO,
    });
    return renderers.renderLine(story);
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
      {
        app_user_id: ownerAppUserId,
        line_user_id: ownerLineUserId,
        mode,
        text,
        text_len: text.length,
        prepared_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, date_local: dateLocal, mode, target, prepared: 1 };
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

  for (const doc of qsnap.docs) {
    const appUserId = doc.id;
    const user = doc.data() || {};
    const lineUserId = getLineUserIdFromUserDoc(user);
    if (!lineUserId) { skipped++; continue; }

    const text = toSafeText(await buildTextFor(appUserId));
    if (!isNonEmptyText(text)) { skipped++; continue; }

    await outboxRoot.doc(appUserId).set(
      {
        app_user_id: appUserId,
        line_user_id: lineUserId,
        mode,
        text,
        text_len: text.length,
        prepared_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    prepared++;
  }

  return { ok: true, date_local: dateLocal, mode, target, prepared, skipped };
}

module.exports = { rebuildDaily8 };
