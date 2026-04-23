"use strict";

const { toBool } = require("../../../utils/data/bool");
const { writeTextFiles } = require("../shared/io");
const { resolveEnv } = require("../../../utils/env");
const { classifyXError } = require("./utils");

function writeLocalPosts({ posts = [], outDir, prefix = "x_post" } = {}) {
  if (!outDir) return [];
  const items = posts.map((post, idx) => {
    const slot = post?.slot || `slot${idx + 1}`;
    const filename = `${prefix}_${slot}_${idx + 1}.txt`;
    return { filename, content: post?.text || "" };
  });
  const result = writeTextFiles({ outDir, items });
  return result.paths;
}

async function saveXPostFailure({ db, dateLocal, asOfISO, kind, posts, results, errors, image, meta } = {}) {
  if (!db) return { ok: false, skipped: true, reason: "db_missing" };
  const outboxRoot = db.collection("posts_x_outbox").doc(dateLocal).collection("items");
  const ref = outboxRoot.doc();
  const payload = {
    kind: kind || "x",
    date_local: dateLocal,
    as_of: asOfISO,
    created_at: new Date().toISOString(),
    posts: Array.isArray(posts) ? posts : [],
    results: Array.isArray(results) ? results : [],
    errors: Array.isArray(errors) ? errors : [],
    image: image || null,
    meta: meta || null,
  };
  await ref.set(payload, { merge: true });
  return { ok: true, id: ref.id };
}

async function notifyXPostFailure({ env, dateLocal, kind, errors, results } = {}) {
  try {
    const env2 = resolveEnv(env);
    const lineEnabled = toBool(env2.LINE_ENABLED, false);
    const accessToken = env2.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineUserId = env2.OWNER_LINE_USER_ID;
    if (!lineEnabled || !accessToken || !ownerLineUserId) {
      return { ok: false, skipped: true, reason: "line_disabled_or_missing" };
    }

    const { createLineApi } = require("../../../integrations/line/api");
    const { pushLineMessage } = require("../../../integrations/line/messaging");

    const lineApiClient = createLineApi({ accessToken });
    const failedSlots = (Array.isArray(errors) ? errors : [])
      .map((e) => e?.slot)
      .filter(Boolean)
      .join(", ") || "unknown";
    const firstError = Array.isArray(errors) ? errors[0] : null;
    const errorInfo = firstError ? classifyXError(firstError?.error || firstError) : null;
    const message = [
      "【X投稿エラー】",
      `種別: ${kind || "x"}`,
      `日付: ${dateLocal || "-"}`,
      `失敗: ${failedSlots}`,
      ...(errorInfo?.summary ? [`理由: ${errorInfo.summary}`] : []),
      `件数: 成功${(Array.isArray(results) ? results.filter((r) => r.ok).length : 0)} / 失敗${Array.isArray(errors) ? errors.length : 0}`,
    ].join("\n");

    return await pushLineMessage({
      lineApiClient,
      to: ownerLineUserId,
      payload: message,
      meta: { kind, dateLocal },
    });
  } catch (err) {
    console.error("[x:notify] failed", err?.message || String(err));
    return { ok: false, error: err };
  }
}

module.exports = {
  writeLocalPosts,
  saveXPostFailure,
  notifyXPostFailure,
};
