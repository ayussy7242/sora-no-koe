"use strict";

const { IG_TOKENS_DAILY } = require("./daily/tokens");
const { IG_TOKENS_MOON_EVENT } = require("./moon_event/tokens");

module.exports = {
  IG_TOKENS: IG_TOKENS_DAILY,
  IG_TOKENS_DAILY,
  IG_TOKENS_MOON_EVENT,
};
