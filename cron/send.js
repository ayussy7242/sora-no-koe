/**
 * cron/send.js (send8)
 *
 * Purpose:
 * - 08:00 に実行して、posts_daily_outbox に準備済みの text を LINE に push する。
 *
 * Design:
 * - send は "生成しない"。outbox を読むだけ。
 * - 生成は rebuild8 に分離しているため、8時直前に最新化してから配信できる。
 *
 * Targets:
 * - target=owner : outbox の owner 1件だけ送る
 * - target=all   : outbox の全件を送る
 *
 * Notes:
 * - LINE API 制約（4800文字）に合わせて toSafeText で安全化
 * - 失敗ログを書きたい場合は posts_daily_delivery へ追記する運用が可能
 */


"use strict";

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function toDateLocalJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
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
function pickTarget(x) {
  const t = normLower(x, "all");
  return t === "owner" ? "owner" : "all";
}

// LINE push
async function linePushText({ accessToken, to, text }) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (typeof fetch !== "function") throw new Error("fetch not available (Node18+ required)");
  if (!to) throw new Error("line_user_id missing");

  const safe = toSafeText(text, 4800);
  if (!isNonEmptyText(safe)) throw new Error("text empty");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "text", text: safe }] }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push error ${res.status} ${t}`);
  }
  return true;
}

async function sendDaily8(deps, opts = {}) {
  const { db, admin, env } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const target = pickTarget(opts.target);

  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const outboxRoot = db.collection("posts_daily_outbox").doc(dateLocal).collection("items");

  // owner は1件だけ読む
  if (target === "owner") {
    const ownerAppUserId = env.OWNER_APP_USER_ID;
    if (!ownerAppUserId) throw new Error("OWNER_APP_USER_ID not set");

    const snap = await outboxRoot.doc(ownerAppUserId).get();
    if (!snap.exists) throw new Error(`outbox missing for owner: ${dateLocal}`);

    const item = snap.data() || {};
    await linePushText({ accessToken, to: item.line_user_id, text: item.text });

    return { ok: true, date_local: dateLocal, target, sent: 1 };
  }

  // all は outbox 全件
  const qsnap = await outboxRoot.get();
  let sent = 0, failed = 0;

  for (const doc of qsnap.docs) {
    const item = doc.data() || {};
    try {
      await linePushText({ accessToken, to: item.line_user_id, text: item.text });
      sent++;
    } catch (e) {
      failed++;
      // 必要ならここで失敗ログを書いてもOK（posts_daily_delivery流用でも良い）
    }
  }

  return { ok: failed === 0, date_local: dateLocal, target, sent, failed };
}

module.exports = { sendDaily8 };
