"use strict";

const { countChars, splitTrailingHashtags, joinBodyAndTags } = require("../../utils/hashtag_utils");

function trimTrailingPunctuation(text) {
  return String(text || "").replace(/[。．.]\s*$/u, "").trim();
}

function ensurePrefix(text, prefix) {
  const raw = String(text || "");
  const p = String(prefix || "");
  if (!p) return raw;
  if (!raw) return raw;
  if (raw.startsWith(p)) return raw;
  return `${p}${raw}`;
}

function ensureSuffix(text, suffix) {
  const raw = String(text || "");
  const s = String(suffix || "");
  if (!s) return raw;
  if (!raw) return raw;
  if (raw.endsWith(s)) return raw;
  return `${raw}${s}`;
}

function applyRepairRule(text, rule, opts = {}) {
  const r = String(rule || "").trim();
  if (!r) return text;
  switch (r) {
    case "trim":
      return String(text || "").trim();
    case "trim_trailing_punctuation":
      return trimTrailingPunctuation(text);
    case "ensure_prefix":
      return ensurePrefix(text, opts?.prefix || opts?.preset?.mustStartWith);
    case "ensure_suffix":
      return ensureSuffix(text, opts?.suffix || opts?.preset?.mustEndWith);
    case "trim_hashtags": {
      const presetRules = opts?.preset?.hashtagRules || {};
      const maxHashtags = Number.isFinite(Number(presetRules.maxHashtags)) ? Number(presetRules.maxHashtags) : null;
      const trimHashtags = presetRules.trimHashtags !== false;
      const maxChars = Number.isFinite(Number(opts?.preset?.maxChars)) ? Number(opts.preset.maxChars) : null;
      const split = splitTrailingHashtags(text);
      let tags = split.tags.slice();
      if (maxHashtags != null && tags.length > maxHashtags) {
        tags = tags.slice(0, maxHashtags);
      }
      let rebuilt = joinBodyAndTags(split.body, tags, { separator: split.separator });
      if (trimHashtags && maxChars != null) {
        while (tags.length && countChars(rebuilt) > maxChars) {
          tags.pop();
          rebuilt = joinBodyAndTags(split.body, tags, { separator: split.separator });
        }
      }
      return rebuilt;
    }
    default:
      return text;
  }
}

function applyRepairRules(text, rules = [], opts = {}) {
  const list = Array.isArray(rules) ? rules : [rules];
  return list.reduce((acc, rule) => applyRepairRule(acc, rule, opts), String(text || ""));
}

module.exports = {
  trimTrailingPunctuation,
  ensurePrefix,
  ensureSuffix,
  applyRepairRule,
  applyRepairRules,
};
