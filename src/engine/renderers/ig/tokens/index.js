"use strict";

const { IG_TOKENS_COMMON, IG_SPACING_TOKENS, IG_TYPOGRAPHY_TOKENS, IG_COLOR_TOKENS } = require("./common");
const { IG_TOKENS_DAILY } = require("./daily/tokens");
const { IG_TOKENS_MOON_EVENT } = require("./moon_event/tokens");

const IG_TOKENS_BY_POST = Object.freeze({
  common: IG_TOKENS_COMMON,
  daily: IG_TOKENS_DAILY,
  moon_event: IG_TOKENS_MOON_EVENT,
});

function resolveIgTokens(postType) {
  const key = String(postType || "").toLowerCase().trim();
  return IG_TOKENS_BY_POST[key] || IG_TOKENS_COMMON;
}

const IG_TOKENS = IG_TOKENS_COMMON;

module.exports = {
  IG_TOKENS,
  IG_TOKENS_COMMON,
  IG_TOKENS_BY_POST,
  IG_SPACING_TOKENS,
  IG_TYPOGRAPHY_TOKENS,
  IG_COLOR_TOKENS,
  resolveIgTokens,
};
