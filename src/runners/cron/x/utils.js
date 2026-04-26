"use strict";

const { countChars, trimTrailingHashtagsToMaxChars } = require("../../../utils/text/hashtag");
const { buildNextMoonEvents, orderedMoonEvents, formatMoonEventDisplay } = require("../../../domain/moon");
const { ensureXMeta } = require("../../../usecases/story/meta_helpers");
const {
  nowIso,
  parseJsonSafe,
  addDaysToDateLocalJST,
  safePreview,
} = require("../shared/utils");

const X_HARD_MAX_CHARS = 180;
const X_PREMIUM_HARD_MAX_CHARS = 4000;

function resolveXHardMaxChars() {
  const premiumEnabled = String(
    process.env.X_PREMIUM_ENABLED ??
    process.env.X_POST_PREMIUM_ENABLED ??
    ""
  ).trim().toLowerCase();
  const isPremium = premiumEnabled
    ? ["1", "true", "yes", "on"].includes(premiumEnabled)
    : true;

  const configured = Number(
    process.env.X_HARD_MAX_CHARS ??
    process.env.X_POST_HARD_MAX_CHARS ??
    ""
  );
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return isPremium ? X_PREMIUM_HARD_MAX_CHARS : X_HARD_MAX_CHARS;
}

function pickPreviewMoonEvent({ dict, asOfISO }) {
  const events = buildNextMoonEvents(asOfISO, dict);
  const ordered = orderedMoonEvents(events);
  const next = ordered[0];
  if (!next) return null;
  const display = formatMoonEventDisplay(next);
  return display ? { ...next, ...display } : next;
}

function truncateForX(text, maxChars) {
  const raw = String(text || "");
  if (!Number.isFinite(Number(maxChars)) || maxChars <= 0) {
    return { text: raw, truncated: false };
  }
  const withTrimmedTags = trimTrailingHashtagsToMaxChars(raw, maxChars, { maxTags: 2 });
  if (countChars(withTrimmedTags) <= maxChars) {
    return { text: withTrimmedTags, truncated: withTrimmedTags !== raw };
  }
  const chars = Array.from(withTrimmedTags);
  const trimmed = chars.slice(0, Math.max(0, maxChars)).join("");
  return { text: trimmed, truncated: true };
}

function resolveXMaxChars(value, fallback = resolveXHardMaxChars()) {
  const resolved = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.min(resolved, resolveXHardMaxChars());
}

function normalizeXError(err) {
  return {
    message: err?.message || String(err),
    status: err?.status || null,
    code: err?.code || null,
    body: err?.body || null,
    headers: err?.headers || null,
    request_id: err?.request_id || err?.requestId || null,
    url: err?.url || null,
    method: err?.method || null,
    name: err?.name || null,
    v2: err?.v2 || null,
    v1: err?.v1 || null,
  };
}

function classifyXError(err) {
  const info = normalizeXError(err);
  const haystack = [
    info.message,
    info.body,
    info.code,
    info.v2?.message,
    info.v2?.body,
    info.v2?.code,
    info.v1?.message,
    info.v1?.body,
    info.v1?.code,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const duplicate =
    haystack.includes("duplicate content") ||
    haystack.includes("duplicate tweet") ||
    haystack.includes("duplicate post") ||
    haystack.includes("status is a duplicate") ||
    haystack.includes("\"code\":187") ||
    haystack.includes("code 187");

  if (duplicate) {
    return {
      kind: "duplicate_content",
      isDuplicateContent: true,
      summary: "duplicate content",
      info,
    };
  }

  const summary =
    info.status && info.code
      ? `${info.status} ${info.code}`
      : info.status
        ? String(info.status)
        : info.code
          ? String(info.code)
          : (info.message || "unknown");

  return {
    kind: "unknown",
    isDuplicateContent: false,
    summary,
    info,
  };
}

module.exports = {
  X_HARD_MAX_CHARS,
  X_PREMIUM_HARD_MAX_CHARS,
  resolveXHardMaxChars,
  nowIso,
  parseJsonSafe,
  addDaysToDateLocalJST,
  pickPreviewMoonEvent,
  truncateForX,
  resolveXMaxChars,
  safePreview,
  normalizeXError,
  classifyXError,
  ensureXMeta,
};
