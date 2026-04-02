"use strict";

const { countChars } = require("../../../utils/text/hashtag");
const { postTweet } = require("../../../integrations/x/x_api");
const { normalizeXError, safePreview } = require("./utils");

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

async function postSingleToX({ text, mediaIds, env }) {
  const res = await postTweet({ text, mediaIds, env });
  const id = res?.id || "";
  if (!id) {
    const err = new Error("X post missing id");
    err.code = "X_POST_ID_MISSING";
    throw err;
  }
  return { ok: true, id, raw: res };
}

module.exports = {
  postThreadToX,
  postSingleToX,
};
