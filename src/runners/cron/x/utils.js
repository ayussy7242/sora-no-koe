"use strict";

const { countChars, trimTrailingHashtagsToMaxChars } = require("../../../utils/text/hashtag");
const { buildNextMoonEvents, orderedMoonEvents, formatMoonEventDisplay } = require("../../../domain/moon");
const {
  nowIso,
  parseJsonSafe,
  addDaysToDateLocalJST,
  safePreview,
} = require("../shared/utils");

const X_HARD_MAX_CHARS = 180;

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
  const withTrimmedTags = trimTrailingHashtagsToMaxChars(raw, maxChars);
  if (countChars(withTrimmedTags) <= maxChars) {
    return { text: withTrimmedTags, truncated: withTrimmedTags !== raw };
  }
  const chars = Array.from(withTrimmedTags);
  const trimmed = chars.slice(0, Math.max(0, maxChars)).join("");
  return { text: trimmed, truncated: true };
}

function resolveXMaxChars(value, fallback = X_HARD_MAX_CHARS) {
  const resolved = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.min(resolved, X_HARD_MAX_CHARS);
}

function normalizeXError(err) {
  return {
    message: err?.message || String(err),
    status: err?.status || null,
    code: err?.code || null,
    body: err?.body || null,
    name: err?.name || null,
  };
}

function ensureXMeta(story) {
  story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
  story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
  story.meta.x_source = story.meta.x_source && typeof story.meta.x_source === "object" ? story.meta.x_source : {};
  return story.meta;
}

module.exports = {
  X_HARD_MAX_CHARS,
  nowIso,
  parseJsonSafe,
  addDaysToDateLocalJST,
  pickPreviewMoonEvent,
  truncateForX,
  resolveXMaxChars,
  safePreview,
  normalizeXError,
  ensureXMeta,
};
