"use strict";

const { SPEC } = require("./sora_spec");

const resolveSignOrder = (dict) => dict?.SIGNS_V2?.order || dict?.SIGNS?.order || null;

const ASPECT_CHANNEL_CONFIG = Object.freeze({
  line_sora: Object.freeze({
    orbLimitFree: SPEC?.orb?.free ?? 1.5,
    orbLimitPaid: SPEC?.orb?.paid ?? 3.0,
    useDeepFree: false,
    useDeepPaid: true,
    maxItemsFree: 1,
    maxItemsPaid: null,
  }),
  line_today: Object.freeze({
    orbLimitFree: SPEC?.orb?.free ?? 1.5,
    orbLimitPaid: SPEC?.orb?.paid ?? 3.0,
    maxItemsFree: 3,
    maxItemsPaid: null,
  }),
  line_paid: Object.freeze({
    orbLimitFree: SPEC?.orb?.free ?? 1.5,
    orbLimitPaid: SPEC?.orb?.paid ?? 3.0,
    tsukijiMinDays: SPEC?.tsukiji?.minDays ?? 14,
    tsukijiMaxItems: SPEC?.tsukiji?.maxItems ?? 3,
    tsukijiOrbLimit: SPEC?.orb?.paid ?? 3.0,
    proximity: Object.freeze({
      kind: "transit-transit",
      orbLimit: SPEC?.orb?.paid ?? 3.0,
      preferApplying: true,
      requireSign: false,
      signOrder: null,
      horizonHours: 24,
      windowDays: 400,
      peakWindowMs: 18 * 60 * 60 * 1000,
      peakStepMs: 5 * 60 * 1000,
      fallbackOutsideOrb: true,
      maxItems: SPEC?.tsukiji?.maxItems ?? 3,
      labelStyle: "boolean",
    }),
  }),
  blog_daily: Object.freeze({
    proximity: Object.freeze({
      kind: "transit-transit",
      orbLimit: SPEC?.orb?.paid ?? 3.0,
      preferApplying: false,
      requireSign: true,
      signOrder: resolveSignOrder,
      horizonHours: 12,
      windowDays: 400,
      peakWindowMs: 18 * 60 * 60 * 1000,
      peakStepMs: 5 * 60 * 1000,
      fallbackOutsideOrb: false,
      maxItems: 3,
      labelStyle: "ja",
    }),
  }),
  tsukiji_public: Object.freeze({
    proximity: Object.freeze({
      kind: "transit-transit",
      orbLimit: SPEC?.orb?.paid ?? 3.0,
      preferApplying: false,
      requireSign: true,
      signOrder: resolveSignOrder,
      horizonHours: 12,
      windowDays: 400,
      peakWindowMs: 18 * 60 * 60 * 1000,
      peakStepMs: 5 * 60 * 1000,
      fallbackOutsideOrb: false,
      maxItems: 3,
      labelStyle: "ja",
    }),
  }),
  x_thread: Object.freeze({
    proximity: Object.freeze({
      kind: "transit-transit",
      orbLimit: SPEC?.orb?.paid ?? 3.0,
      preferApplying: true,
      requireSign: false,
      signOrder: null,
      horizonHours: 24,
      windowDays: 400,
      peakWindowMs: 18 * 60 * 60 * 1000,
      peakStepMs: 5 * 60 * 1000,
      fallbackOutsideOrb: true,
      maxItems: 2,
      labelStyle: "boolean",
    }),
  }),
});

function resolveProximityConfig(channelKey, dict) {
  const base = ASPECT_CHANNEL_CONFIG?.[channelKey]?.proximity || {};
  const signOrder =
    typeof base.signOrder === "function"
      ? base.signOrder(dict)
      : base.signOrder || null;
  return { ...base, signOrder };
}

function resolveChannelConfig(channelKey) {
  return ASPECT_CHANNEL_CONFIG?.[channelKey] || {};
}

module.exports = {
  ASPECT_CHANNEL_CONFIG,
  resolveProximityConfig,
  resolveChannelConfig,
};
