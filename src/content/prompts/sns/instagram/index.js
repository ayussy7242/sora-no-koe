"use strict";

const {
  SORA_AI_PUBLIC_IG_COMMON,
  SORA_AI_PUBLIC_IG_SHORT_COMMON,
  POLITE_TONE_COMMON,
} = require("./common");
const morning = require("./daily/morning");
const resonance = require("./daily/resonance");
const night = require("./daily/night");
const hashtags = require("./daily/hashtags");
const moonEvent = require("./moon_event/carousel");
const monthly = require("./monthly/caption");

module.exports = Object.freeze({
  SORA_AI_PUBLIC_IG_COMMON,
  SORA_AI_PUBLIC_IG_SHORT_COMMON,
  POLITE_TONE_COMMON,
  ...morning,
  ...resonance,
  ...night,
  ...hashtags,
  ...moonEvent,
  ...monthly,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT: moonEvent.SORA_AI_USER_GUIDE_IG_MOON_EVENT_AIR,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_CAPTION: moonEvent.SORA_AI_USER_GUIDE_IG_MOON_EVENT_CAPTION,
});
