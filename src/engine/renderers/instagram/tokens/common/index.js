"use strict";

const { IG_SPACING_TOKENS } = require("./spacing");
const { IG_TYPOGRAPHY_TOKENS } = require("./typography");
const { IG_COLOR_TOKENS, DEFAULT_COLORS, TEXT_BASE, BODY_GLOW_COLORS } = require("./colors");

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeTokens(base, override) {
  if (!isObject(base)) return override;
  const out = { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    if (isObject(value) && isObject(out[key])) {
      out[key] = mergeTokens(out[key], value);
      return;
    }
    out[key] = value;
  });
  return out;
}

const IG_TOKENS_COMMON = Object.freeze(
  mergeTokens(mergeTokens(IG_SPACING_TOKENS, IG_TYPOGRAPHY_TOKENS), IG_COLOR_TOKENS)
);

module.exports = {
  IG_SPACING_TOKENS,
  IG_TYPOGRAPHY_TOKENS,
  IG_COLOR_TOKENS,
  DEFAULT_COLORS,
  TEXT_BASE,
  BODY_GLOW_COLORS,
  IG_TOKENS_COMMON,
  mergeTokens,
};
