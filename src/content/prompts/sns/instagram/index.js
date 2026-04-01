"use strict";

const {
  SORA_AI_PUBLIC_IG_COMMON,
  SORA_AI_PUBLIC_IG_SHORT_COMMON,
  POLITE_TONE_COMMON,
} = require("./common");
const daily = require("./daily/carousel");
const moonEvent = require("./moon_event/carousel");

module.exports = Object.freeze({
  SORA_AI_PUBLIC_IG_COMMON,
  SORA_AI_PUBLIC_IG_SHORT_COMMON,
  POLITE_TONE_COMMON,
  ...daily,
  ...moonEvent,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT: moonEvent.SORA_AI_USER_GUIDE_IG_MOON_EVENT_AIR,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_CAPTION: moonEvent.SORA_AI_USER_GUIDE_IG_MOON_EVENT_CAPTION,
});
