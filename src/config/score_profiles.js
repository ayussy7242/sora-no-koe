"use strict";

const PROFILES = Object.freeze({
  modern: {
    sun: 1.0,
    moon: 1.0,
    mercury: 0.9,
    venus: 0.9,
    mars: 0.9,
    jupiter: 0.8,
    saturn: 0.8,
    uranus: 0.7,
    neptune: 0.7,
    pluto: 0.7,
    lilith: 0.5,
    chiron: 0.5,
  },
  traditional: {
    sun: 1.0,
    moon: 1.0,
    mercury: 0.9,
    venus: 0.9,
    mars: 0.9,
    jupiter: 0.8,
    saturn: 0.8,
    uranus: 0.4,
    neptune: 0.4,
    pluto: 0.4,
    lilith: 0.2,
    chiron: 0.2,
  },
});

const DEFAULT_PROFILE = "modern";

function weightForBody(bodyKey, profile = DEFAULT_PROFILE) {
  const k = String(bodyKey || "").toLowerCase();
  const p = PROFILES[profile] || PROFILES[DEFAULT_PROFILE];
  return p?.[k] ?? 0.6;
}

function scoreForAspect({ orb, aKey, bKey, profile = DEFAULT_PROFILE }) {
  const wA = weightForBody(aKey, profile);
  const wB = weightForBody(bKey, profile);
  const o = Math.max(0.1, Number(orb) || 0.1);
  return (wA + wB) * (1 / (o + 0.5));
}

module.exports = {
  PROFILES,
  DEFAULT_PROFILE,
  weightForBody,
  scoreForAspect,
};
