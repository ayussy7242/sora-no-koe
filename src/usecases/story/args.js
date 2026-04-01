"use strict";

// args.js
// - buildStoryForUser の入力を共通整形する薄いヘルパー

const { clamp, toNumberSafe } = require("../../utils/parse");

/**
 * buildStoryForUser の args を共通化
 * - dateLocal / asOfISO は呼び出し側で決める
 * - orb / precision はここで clamp
 */
function normalizeStoryArgs({
  appUserId,
  mode,
  dateLocal,
  asOfISO,
  orbMaxDeg,
  precisionDeg,
}) {
  return {
    appUserId,
    mode,
    dateLocal,
    asOfISO,
    orbMaxDeg: clamp(toNumberSafe(orbMaxDeg, 6), 0.1, 12),
    precisionDeg: clamp(toNumberSafe(precisionDeg, 0.01), 0.001, 1),
  };
}

module.exports = { normalizeStoryArgs };
