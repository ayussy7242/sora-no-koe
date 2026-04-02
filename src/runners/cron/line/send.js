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

const path = require("path");
const { isYYYYMMDD, toDateLocalJST } = require("../../../utils/time");
const { normLower } = require("../../../utils/data/parse");
const { toBool } = require("../../../utils/data/bool");
const { isNonEmptyText } = require("../cron_utils");
const { writeLocalLineOutputs } = require("./io");
const { linePushText, linePushImage } = require("./publish");

function pickTarget(x) {
  const t = normLower(x, "all");
  return t === "owner" ? "owner" : "all";
}
function writeLocalSendOutputs({ outDir, dateLocal, target, items, summary }) {
  const dir = outDir || path.join(process.cwd(), "tmp", "line", "send8", dateLocal || "unknown");
  const payload = {
    date_local: dateLocal,
    target,
    summary: summary || null,
    items: Array.isArray(items) ? items : [],
  };
  return writeLocalLineOutputs({ outDir: dir, summary: payload, items });
}

// LINE push moved to publish.js

async function sendDaily8(deps, opts = {}) {
  const { db, admin, env } = deps || {};
  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");

  const env2 = { ...(env || {}), ...(process.env || {}) };
  // Temporary: disable sending any LINE images in daily 08:00
  const DISABLE_DAILY8_IMAGES = true;

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const target = pickTarget(opts.target);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run, false);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.SEND8_LOCAL_ONLY,
    false
  );
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.SEND8_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "line", "send8", dateLocal || "unknown")
  );
  const runDry = dryRun || localOnly;

  const accessToken = env2.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken && !localOnly) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

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

    if (localOnly) {
      const summary = { targets: { planned: 1, sent: 0, failed: 0 }, last_error: null };
      const local = writeLocalSendOutputs({
        outDir: localOutDir,
        dateLocal,
        target,
        items: [{ app_user_id: ownerAppUserId, line_user_id: item.line_user_id, text: item.text, image_url: item.image_url || null }],
        summary,
      });
      return {
        ok: true,
        date_local: dateLocal,
        target,
        sent: 0,
        failed: 0,
        dry_run: runDry,
        local_only: true,
        local_dir: local.dir,
        local_paths: local.text_paths,
        summary_path: local.summary_path,
      };
    }

    if (!runDry) {
      await linePushText({ accessToken, to: item.line_user_id, text: item.text });
      if (!DISABLE_DAILY8_IMAGES && item.image_url) {
        await linePushImage({ accessToken, to: item.line_user_id, imageUrl: item.image_url });
      }
      return { ok: true, date_local: dateLocal, target, sent: 1, failed: 0, dry_run: runDry };
    }
    return { ok: true, date_local: dateLocal, target, sent: 0, failed: 0, dry_run: runDry };
  }

  // ---------- all ----------
  const qsnap = await outboxRoot.get();
  const planned = qsnap.size;
  let sent = 0, failed = 0;
  const localItems = [];

  for (const doc of qsnap.docs) {
    const item = doc.data() || {};
    try {
      if (!item.line_user_id) throw new Error("missing line_user_id");
      if (!isNonEmptyText(item.text)) throw new Error("text empty");

      if (localOnly) {
        localItems.push({
          app_user_id: doc.id,
          line_user_id: item.line_user_id,
          text: item.text,
          image_url: item.image_url || null,
        });
        continue;
      }

      if (!runDry) {
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

  if (localOnly) {
    const summary = { targets: { planned, sent: 0, failed }, last_error: failed ? "some_failed" : null };
    const local = writeLocalSendOutputs({
      outDir: localOutDir,
      dateLocal,
      target,
      items: localItems,
      summary,
    });
    return {
      ok: failed === 0,
      date_local: dateLocal,
      target,
      planned,
      sent: 0,
      failed,
      dry_run: runDry,
      local_only: true,
      local_dir: local.dir,
      local_paths: local.text_paths,
      summary_path: local.summary_path,
    };
  }

  return {
    ok: failed === 0,
    date_local: dateLocal,
    target,
    planned,
    sent: runDry ? 0 : sent,
    failed,
    dry_run: runDry,
  };
}

module.exports = { sendDaily8 };
