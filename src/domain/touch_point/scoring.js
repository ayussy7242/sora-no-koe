"use strict";

const { normalizeBodyKey } = require("../canonical");
const {
  PROFILES,
  DEFAULT_PROFILE,
  weightForBody: weightForBodyRaw,
  scoreForAspect: scoreForAspectRaw,
} = require("../../config/score_profiles");

function weightForBody(bodyKey, profile = DEFAULT_PROFILE) {
  return weightForBodyRaw(normalizeBodyKey(bodyKey), profile);
}

function scoreForAspect({ orb, aKey, bKey, profile = DEFAULT_PROFILE, natalKey, transitKey }) {
  const keyA = normalizeBodyKey(aKey || natalKey);
  const keyB = normalizeBodyKey(bKey || transitKey);
  return scoreForAspectRaw({ orb, aKey: keyA, bKey: keyB, profile });
}

module.exports = {
  PROFILES,
  DEFAULT_PROFILE,
  weightForBody,
  scoreForAspect,
};
