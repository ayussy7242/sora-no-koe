"use strict";

const { IG_TOKENS_COMMON, mergeTokens } = require("../common");

const IG_TOKENS_MOON_EVENT = Object.freeze(
  mergeTokens(IG_TOKENS_COMMON, {})
);

module.exports = { IG_TOKENS_MOON_EVENT };
