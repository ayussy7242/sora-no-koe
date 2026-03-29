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
 * - dry_run=true のときは絶対に送らない（事故防止）
 */

"use strict";

const { isYYYYMMDD, toDateLocalJST } = require("../../utils/time_utils");
const { normLower } = require("../../utils/parse");

function toSafeText(x, maxLen = 4800) {
  const s = x == null ? "" : String(x);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}
function isNonEmptyText(x) {
  const s = x == null ? "" : String(x);
  return s.trim().length > 0;
}
function pickTarget(x) {
  const t = normLower(x, "all");
  return t === "owner" ? "owner" : "all";
}
function toBool(v, defaultValue = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (v === undefined || v === null || v === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
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

async function linePushImage({ accessToken, to, imageUrl, previewUrl }) {
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  if (typeof fetch !== "function") throw new Error("fetch not available (Node18+ required)");
  if (!to) throw new Error("line_user_id missing");
  if (!imageUrl) throw new Error("image_url missing");

  const originalContentUrl = String(imageUrl);
  const previewImageUrl = String(previewUrl || imageUrl);

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      messages: [{ type: "image", originalContentUrl, previewImageUrl }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE push image error ${res.status} ${t}`);
  }
  return true;
}

async function sendDaily8(deps, opts = {}) {
  const { db, admin, env } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");

  // Temporary: disable sending any LINE images in daily 08:00
  const DISABLE_DAILY8_IMAGES = true;

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const target = pickTarget(opts.target);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run, false);

  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

  const outboxRoot = db.collection("posts_daily_outbox").doc(dateLocal).collection("items");

  // ---------- owner ----------
  if (target === "owner") {
    const ownerAppUserId = env.OWNER_APP_USER_ID;
    if (!ownerAppUserId) throw new Error("OWNER_APP_USER_ID not set");

    const snap = await outboxRoot.doc(ownerAppUserId).get();
    if (!snap.exists) throw new Error(`outbox missing for owner: ${dateLocal}`);

    const item = snap.data() || {};
    if (!item.line_user_id) throw new Error("outbox item missing line_user_id");
    if (!isNonEmptyText(item.text)) throw new Error("outbox item text empty");

    if (!dryRun) {
      await linePushText({ accessToken, to: item.line_user_id, text: item.text });
      if (!DISABLE_DAILY8_IMAGES && item.image_url) {
        await linePushImage({ accessToken, to: item.line_user_id, imageUrl: item.image_url });
      }
      return { ok: true, date_local: dateLocal, target, sent: 1, failed: 0, dry_run: dryRun };
    }
    return { ok: true, date_local: dateLocal, target, sent: 0, failed: 0, dry_run: dryRun };
  }

  // ---------- all ----------
  const qsnap = await outboxRoot.get();
  const planned = qsnap.size;
  let sent = 0, failed = 0;

  for (const doc of qsnap.docs) {
    const item = doc.data() || {};
    try {
      if (!item.line_user_id) throw new Error("missing line_user_id");
      if (!isNonEmptyText(item.text)) throw new Error("text empty");

      if (!dryRun) {
        await linePushText({ accessToken, to: item.line_user_id, text: item.text });
        if (!DISABLE_DAILY8_IMAGES && item.image_url) {
          await linePushImage({ accessToken, to: item.line_user_id, imageUrl: item.image_url });
        }
        sent++;
      }
    } catch (_e) {
      failed++;
      // ここで delivery ログ書くなら追加可能
    }
  }

  return {
    ok: failed === 0,
    date_local: dateLocal,
    target,
    planned,
    sent: dryRun ? 0 : sent,
    failed,
    dry_run: dryRun,
  };
}

module.exports = { sendDaily8 };
