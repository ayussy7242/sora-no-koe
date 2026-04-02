"use strict";

const fs = require("fs");
const path = require("path");
const { countChars } = require("../../../utils/text/hashtag");
const { toBool } = require("../../../utils/data/bool");
const { postTweet } = require("../../../integrations/x/x_api");
const { normalizeXError, safePreview } = require("./utils");

function writeLocalPosts({ posts = [], outDir, prefix = "x_post" } = {}) {
  if (!outDir) return [];
  fs.mkdirSync(outDir, { recursive: true });
  const paths = [];
  posts.forEach((post, idx) => {
    const slot = post?.slot || `slot${idx + 1}`;
    const file = path.join(outDir, `${prefix}_${slot}_${idx + 1}.txt`);
    fs.writeFileSync(file, String(post?.text || ""), "utf8");
    paths.push(file);
  });
  return paths;
}

async function postThreadToX({ posts, env }) {
  const ids = [];
  const results = [];
  let replyTo = null;
  for (let idx = 0; idx < posts.length; idx += 1) {
    const item = posts[idx];
    const text = typeof item === "string" ? item : item?.text;
    const mediaIds = typeof item === "string" ? null : item?.mediaIds;
    const slot = typeof item === "string" ? `post_${idx + 1}` : (item?.slot || `post_${idx + 1}`);
    const textLen = countChars(text);

    try {
      const res = await postTweet({ text, replyToId: replyTo, mediaIds, env });
      const id = res?.id || "";
      if (!id) {
        const err = new Error("X post missing id");
        err.code = "X_POST_ID_MISSING";
        throw err;
      }
      ids.push(id);
      results.push({
        ok: true,
        slot,
        id,
        reply_to: replyTo,
        text_len: textLen,
      });
      replyTo = id;
    } catch (err) {
      const info = normalizeXError(err);
      results.push({
        ok: false,
        slot,
        error: info,
        reply_to: replyTo,
        text_len: textLen,
        text_preview: safePreview(text),
      });
      console.error("[x:post] failed", {
        slot,
        reply_to: replyTo,
        text_len: textLen,
        text_preview: safePreview(text),
        ...info,
      });
      // continue: keep replyTo as last successful
    }
  }
  return {
    ids,
    results,
    errors: results.filter((r) => !r.ok),
  };
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
    const env2 = { ...(env || {}), ...(process.env || {}) };
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
    const message = [
      "【X投稿エラー】",
      `種別: ${kind || "x"}`,
      `日付: ${dateLocal || "-"}`,
      `失敗: ${failedSlots}`,
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
  postThreadToX,
  saveXPostFailure,
  notifyXPostFailure,
};
