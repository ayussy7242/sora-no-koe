"use strict";

function isMessagePayload(payload) {
  return payload && typeof payload === "object" && (payload.type || Array.isArray(payload));
}

function buildTextMessage(text, { maxText, toSafeText, isNonEmptyText } = {}) {
  const safe = toSafeText ? toSafeText(text, maxText) : String(text || "");
  if (isNonEmptyText && !isNonEmptyText(safe)) return null;
  return { type: "text", text: safe };
}

function normalizeLineMessages(payload, { maxText, toSafeText, isNonEmptyText } = {}) {
  if (Array.isArray(payload)) return payload;
  if (isMessagePayload(payload)) return payload;
  return buildTextMessage(payload, { maxText, toSafeText, isNonEmptyText });
}

async function replyLineMessage({
  lineApiClient,
  replyToken,
  payload,
  maxText,
  toSafeText,
  isNonEmptyText,
  meta = {},
  debug = false,
  logger = console.log,
} = {}) {
  if (!replyToken || !lineApiClient) return { ok: false, skipped: true, reason: "missing_reply_token" };

  try {
    if (isMessagePayload(payload)) {
      await lineApiClient.replyMessages(replyToken, payload, { toSafeText });
      if (debug) logger("[line:reply] sent", meta);
      return { ok: true };
    }

    const safe = toSafeText ? toSafeText(payload, maxText) : String(payload || "");
    if (isNonEmptyText && !isNonEmptyText(safe)) {
      logger("[line:reply] skipped(empty)", meta);
      return { ok: false, skipped: true, reason: "empty" };
    }

    await lineApiClient.replyText(replyToken, safe, { toSafeText, isNonEmptyText });
    if (debug) logger("[line:reply] sent", meta);
    return { ok: true };
  } catch (e) {
    logger("[line:reply] failed:", e?.message || String(e), meta);
    return { ok: false, error: e };
  }
}

async function pushLineMessage({
  lineApiClient,
  to,
  payload,
  maxText,
  toSafeText,
  isNonEmptyText,
  meta = {},
  debug = false,
  logger = console.log,
} = {}) {
  if (!to || !lineApiClient) return { ok: false, skipped: true, reason: "missing_to" };

  try {
    const normalized = normalizeLineMessages(payload, { maxText, toSafeText, isNonEmptyText });
    if (!normalized) {
      logger("[line:push] skipped(empty)", meta);
      return { ok: false, skipped: true, reason: "empty" };
    }

    await lineApiClient.pushMessages(to, normalized, { toSafeText });
    if (debug) logger("[line:push] sent", meta);
    return { ok: true };
  } catch (e) {
    logger("[line:push] failed:", e?.message || String(e), meta);
    return { ok: false, error: e };
  }
}

module.exports = {
  buildTextMessage,
  normalizeLineMessages,
  replyLineMessage,
  pushLineMessage,
};
